from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File,Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
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

# Generate encryption key if not exists
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    ENCRYPTION_KEY = Fernet.generate_key()
    print("Generated new encryption key:", ENCRYPTION_KEY.decode())
fernet = Fernet(ENCRYPTION_KEY)

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
    encrypted_key: Optional[str] = None
    error: Optional[str] = None


def encrypt_image(image_data: bytes) -> tuple[bytes, str]:
    """Encrypt image data and return encrypted data with key."""
    # Generate a unique key for this image
    image_key = Fernet.generate_key()
    image_fernet = Fernet(image_key)
    
    # Encrypt the image
    encrypted_data = image_fernet.encrypt(image_data)
    
    # Encrypt the image key with master key
    encrypted_key = fernet.encrypt(image_key).decode()
    
    return encrypted_data, encrypted_key

def decrypt_image(encrypted_data: bytes, encrypted_key: str) -> bytes:
    """Decrypt image data using the encrypted key."""
    # Decrypt the image key
    image_key = fernet.decrypt(encrypted_key.encode())
    image_fernet = Fernet(image_key)
    
    # Decrypt the image
    return image_fernet.decrypt(encrypted_data)



@app.post("/api/upload-image/{room_code}")
async def upload_image(room_code: str, file: UploadFile = File(...)) -> ImageUploadResponse:
    """Upload an encrypted image and return the URL with encryption key."""
    try:
        # Verify room exists
        room = await db.rooms.find_one({"code": room_code})
        if not room:
            return ImageUploadResponse(success=False, error="Room not found")

        # Read and validate file
        image_data = await file.read()
        if len(image_data) > MAX_IMAGE_SIZE:
            return ImageUploadResponse(success=False, error="Image size exceeds 32MB limit")

        # Validate file type
        content_type = file.content_type
        if not content_type or not content_type.startswith('image/'):
            return ImageUploadResponse(success=False, error="Invalid file type. Only images are allowed.")

        # Encrypt image
        encrypted_data, encrypted_key = encrypt_image(image_data)
        
        try:
            async with aiohttp.ClientSession() as session:
                # Convert image to base64 with proper data URI prefix
                base64_image = base64.b64encode(encrypted_data).decode('utf-8')
                
                # Create the form data as a regular dictionary
                payload = {
                    'key': IMGBB_API_KEY,
                    'image': base64_image,  # Send raw base64 without data URI prefix
                }

                # Make the POST request
                async with session.post(
                    'https://api.imgbb.com/1/upload',
                    data=payload,  # Use data instead of json
                    headers={
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        print(f"ImgBB API error: Status {response.status}, Response: {error_text}")
                        return ImageUploadResponse(
                            success=False,
                            error=f"ImgBB API error: {error_text}"
                        )
                    
                    result = await response.json()
                    
                    if not result.get("success"):
                        error_msg = result.get("error", {}).get("message", "Unknown error")
                        print(f"ImgBB upload error: {error_msg}")
                        return ImageUploadResponse(
                            success=False,
                            error=f"ImgBB upload failed: {error_msg}"
                        )
                    
                    return ImageUploadResponse(
                        success=True,
                        image_url=result["data"]["url"],
                        encrypted_key=encrypted_key
                    )
            
        except aiohttp.ClientError as e:
            print(f"Network error during upload: {str(e)}")
            return ImageUploadResponse(
                success=False,
                error=f"Network error: {str(e)}"
            )
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return ImageUploadResponse(
            success=False,
            error=f"Upload failed: {str(e)}"
        )

@app.post("/api/images/decrypt")
async def decrypt_image_url(request: Request):
    """Fetch and decrypt an image from its URL."""
    try:
        # Get request body
        body = await request.json()
        image_url = body.get('image_url')
        encrypted_key = body.get('encrypted_key')
        
        if not image_url or not encrypted_key:
            raise HTTPException(status_code=400, detail="Missing image_url or encrypted_key")

        async with aiohttp.ClientSession() as session:
            async with session.get(image_url) as response:
                if response.status != 200:
                    raise HTTPException(status_code=404, detail="Image not found")
                
                encrypted_data = await response.read()
                
                try:
                    decrypted_data = decrypt_image(encrypted_data, encrypted_key)
                except Exception as e:
                    print(f"Decryption error: {str(e)}")
                    raise HTTPException(status_code=400, detail="Failed to decrypt image")
                
                # Return decrypted image in base64 format
                return {
                    "success": True,
                    "image_data": base64.b64encode(decrypted_data).decode('utf-8')
                }
                
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in decrypt_image_url: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
                    "image_url": data.get("image_url"),
                    "encrypted_key": data.get("encrypted_key")  # Store encryption key with message
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
