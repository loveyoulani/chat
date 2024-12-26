from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Optional, List
from contextlib import asynccontextmanager
import secrets
import string
import datetime
import uuid
from pymongo import ASCENDING
import asyncio
import os
import uvicorn
from bson import ObjectId

MONGO_URL = os.getenv("DB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("NAME", "sayit")
PORT = int(os.getenv("PORT", 8000))

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, schema_generator):
        return {"type": "string"}

class MessageModel(BaseModel):
    content: str
    sender: str
    timestamp: datetime.datetime

    class Config:
        json_encoders = {datetime.datetime: lambda dt: dt.isoformat()}

class ChatRoom(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    code: str
    created_at: datetime.datetime
    expires_at: datetime.datetime
    messages: List[dict] = []

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str, datetime.datetime: lambda dt: dt.isoformat()}

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
        self.active_connections[room_code].append(websocket)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.active_connections:
            self.active_connections[room_code].remove(websocket)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def broadcast(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            for connection in self.active_connections[room_code]:
                try:
                    await connection.send_json(message)
                except:
                    await self.disconnect(connection, room_code)

manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.rooms.create_index([("code", ASCENDING)], unique=True)
    await db.rooms.create_index([("expires_at", ASCENDING)])
    cleanup_task = asyncio.create_task(cleanup_expired_rooms(db))
    yield
    cleanup_task.cancel()
    client.close()

app = FastAPI(lifespan=lifespan, title="Sayit API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

def generate_room_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

async def cleanup_expired_rooms(db):
    while True:
        try:
            await db.rooms.delete_many({"expires_at": {"$lt": datetime.datetime.utcnow()}})
            await asyncio.sleep(3600)  # Run hourly
        except Exception as e:
            print(f"Cleanup error: {e}")
            await asyncio.sleep(300)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.datetime.utcnow().isoformat()}

@app.post("/api/rooms")
async def create_room():
    code = generate_room_code()
    while await db.rooms.find_one({"code": code}):
        code = generate_room_code()
    
    room = {
        "code": code,
        "created_at": datetime.datetime.utcnow(),
        "expires_at": datetime.datetime.utcnow() + datetime.timedelta(days=1),
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
            message = {
                "content": data["content"],
                "sender": data["sender"],
                "timestamp": datetime.datetime.utcnow().isoformat()
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
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
