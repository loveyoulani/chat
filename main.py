from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import secrets
import string
import asyncio
import os
import uvicorn
import aiohttp
import base64

# Configuration
MONGO_URL = os.getenv("DB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("NAME", "sayit")
PORT = int(os.getenv("PORT", 10000))
APP_URL = os.getenv("APP_URL", "http://localhost:10000")
IMGBB_API_KEY = os.getenv("IMGBB_API_KEY")
MAX_IMAGE_SIZE = 32 * 1024 * 1024  # 32 MB in bytes

app = FastAPI(title="Sayit Backend")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_counts: Dict[str, int] = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
            self.user_counts[room_code] = 0
        self.active_connections[room_code].append(websocket)
        self.user_counts[room_code] += 1
        await self.broadcast_user_count(room_code)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.active_connections:
            try:
                self.active_connections[room_code].remove(websocket)
                self.user_counts[room_code] -= 1
                if self.user_counts[room_code] <= 0:
                    del self.active_connections[room_code]
                    del self.user_counts[room_code]
                else:
                    asyncio.create_task(self.broadcast_user_count(room_code))
            except ValueError:
                pass

    async def broadcast_user_count(self, room_code: str):
        if room_code in self.active_connections:
            count = self.user_counts[room_code]
            await self.broadcast(
                {"type": "user_count", "count": count},
                room_code
            )

    async def broadcast(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            disconnected = []
            for connection in self.active_connections[room_code]:
                try:
                    await connection.send_json(message)
                except WebSocketDisconnect:
                    disconnected.append(connection)
                except Exception:
                    disconnected.append(connection)
            
            # Clean up disconnected clients
            for connection in disconnected:
                self.disconnect(connection, room_code)

manager = ConnectionManager()

class ImageUploadResponse(BaseModel):
    success: bool
    image_url: Optional[str] = None
    error: Optional[str] = None

async def upload_to_imgbb(image_data: bytes, filename: str) -> dict:
    """Upload an image to ImgBB and return the response."""
    if not IMGBB_API_KEY:
        raise HTTPException(status_code=500, detail="ImgBB API key not configured")

    base64_image = base64.b64encode(image_data).decode('utf-8')
    
    async with aiohttp.ClientSession() as session:
        url = f"https://api.imgbb.com/1/upload"
        params = {
            "key": IMGBB_API_KEY,
            "expiration": 600  # 10 minutes expiration
        }
        data = {
            "image": base64_image,
            "name": filename
        }
        
        async with session.post(url, params=params, data=data) as response:
            result = await response.json()
            if not result.get("success"):
                raise HTTPException(status_code=500, detail="Failed to upload image")
            return result

@app.post("/api/upload-image/{room_code}")
async def upload_image(room_code: str, file: UploadFile = File(...)) -> ImageUploadResponse:
    """Upload an image and return the URL."""
    try:
        # Verify room exists
        room = await db.rooms.find_one({"code": room_code})
        if not room:
            return ImageUploadResponse(success=False, error="Room not found")

        # Read and validate file size
        image_data = await file.read()
        if len(image_data) > MAX_IMAGE_SIZE:
            return ImageUploadResponse(success=False, error="Image size exceeds 32MB limit")

        # Upload to ImgBB
        result = await upload_to_imgbb(image_data, file.filename)
        
        return ImageUploadResponse(
            success=True,
            image_url=result["data"]["url"]
        )

    except Exception as e:
        return ImageUploadResponse(success=False, error=str(e))

async def ping_self():
    """Periodically ping the application to keep it active."""
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(f"{APP_URL}/") as response:
                    if response.status == 200:
                        print(f"Self-ping successful at {datetime.utcnow()}")
                    else:
                        print(f"Self-ping failed with status {response.status}")
            except Exception as e:
                print(f"Self-ping error: {e}")
            await asyncio.sleep(600)

def generate_room_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@app.on_event("startup")
async def startup_event():
    try:
        await db.rooms.drop_indexes()
    except Exception:
        pass
    
    await db.rooms.create_index([("code", 1)], unique=True)
    await db.rooms.create_index([("expires_at", 1)])
    
    app.state.cleanup_task = asyncio.create_task(cleanup_expired_rooms())
    app.state.ping_task = asyncio.create_task(ping_self())

@app.on_event("shutdown")
async def shutdown_event():
    if hasattr(app.state, 'cleanup_task'):
        app.state.cleanup_task.cancel()
    if hasattr(app.state, 'ping_task'):
        app.state.ping_task.cancel()

async def cleanup_expired_rooms():
    while True:
        try:
            result = await db.rooms.delete_many({
                "expires_at": {"$lt": datetime.utcnow()}
            })
            print(f"Cleaned up {result.deleted_count} expired rooms")
            await asyncio.sleep(3600)
        except Exception as e:
            print(f"Error in cleanup task: {e}")
            await asyncio.sleep(300)

@app.get("/")
async def root():
    return {
        "status": "healthy",
        "app": "Sayit",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/rooms/create")
async def create_room():
    max_attempts = 5
    for attempt in range(max_attempts):
        try:
            code = generate_room_code()
            room = {
                "code": code,
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(days=1),
                "messages": []
            }
            
            await db.rooms.insert_one(room)
            return {"code": code}
        except Exception as e:
            if attempt == max_attempts - 1:
                raise HTTPException(status_code=500, detail="Failed to create room")
            continue

@app.get("/api/rooms/{room_code}")
async def get_room(room_code: str):
    room = await db.rooms.find_one({"code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    room["_id"] = str(room["_id"])
    return room

@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await manager.connect(websocket, room_code)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "typing":
                await manager.broadcast(data, room_code)
            else:
                message = {
                    "type": "message",
                    "content": data["content"],
                    "sender": data["sender"],
                    "timestamp": datetime.utcnow().isoformat(),
                    "image_url": data.get("image_url")  # Add support for image messages
                }
                await db.rooms.update_one(
                    {"code": room_code},
                    {"$push": {"messages": message}}
                )
                await manager.broadcast(message, room_code)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket, room_code)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
