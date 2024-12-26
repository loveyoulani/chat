from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import secrets
import string
import uuid
from pymongo import ASCENDING
import asyncio
import os
import uvicorn

# Configuration
MONGO_URL = os.getenv("DB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("NAME", "sayit")
PORT = int(os.getenv("PORT", 10000))

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
            self.active_connections[room_code].remove(websocket)
            self.user_counts[room_code] -= 1
            if self.user_counts[room_code] <= 0:
                del self.active_connections[room_code]
                del self.user_counts[room_code]
            else:
                asyncio.create_task(self.broadcast_user_count(room_code))

    async def broadcast_user_count(self, room_code: str):
        if room_code in self.active_connections:
            count = self.user_counts[room_code]
            await self.broadcast(
                {"type": "user_count", "count": count},
                room_code
            )

    async def broadcast(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            for connection in self.active_connections[room_code]:
                try:
                    await connection.send_json(message)
                except:
                    continue

manager = ConnectionManager()

def generate_room_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@app.on_event("startup")
async def startup_event():
    await db.rooms.create_index([("code", ASCENDING)], unique=True)
    await db.rooms.create_index([("expires_at", ASCENDING)])
    asyncio.create_task(cleanup_expired_rooms())

async def cleanup_expired_rooms():
    while True:
        try:
            await db.rooms.delete_many({
                "expires_at": {"$lt": datetime.utcnow()}
            })
            await asyncio.sleep(3600)  # Run hourly
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
    code = generate_room_code()
    while await db.rooms.find_one({"code": code}):
        code = generate_room_code()
    
    room = {
        "code": code,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=1),
        "messages": []
    }
    
    await db.rooms.insert_one(room)
    return {"code": code}

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
                    "content": data["content"],
                    "sender": data["sender"],
                    "timestamp": datetime.utcnow().isoformat()
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
