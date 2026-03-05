#!/bin/bash

echo "Starting RightNow Fitness services..."

# Start frontend
echo "Starting frontend on port 3000..."
cd frontend && npm run dev &

# Start backend
echo "Starting backend on port 3100..."
cd ../backend && npm run start:dev &

# Start RAG service
echo "Starting RAG service on port 8000..."
cd ../rag-service && python -m app.main &

echo "All services started!"
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:3100"
echo "RAG: http://localhost:8000"
