# LexVision - AI-Based Smart Traffic Violation Detection

LexVision is a comprehensive system designed to detect and manage traffic violations using AI. It consists of a FastAPI backend (ML Services) and multiple React-based frontend portals.

## 🚀 Getting Started

Follow these instructions to set up and run the LexVision project on your local machine.

### 📋 Prerequisites

Ensure you have the following installed:
- **Node.js** (v18 or higher)
- **pnpm** (Package manager for Node)
- **Python** (3.10 or higher)
- **PostgreSQL** (Database)
- **Redis** (For asynchronous tasks/queues)

---

### 🗄️ 1. Database Setup (PostgreSQL)

LexVision requires a PostgreSQL database. Run the following commands in your terminal to set up the user and database:

```bash
sudo -u postgres psql -c "CREATE USER lexvision_user WITH PASSWORD 'password123';"
sudo -u postgres psql -c "CREATE DATABASE lexvision OWNER lexvision_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE lexvision TO lexvision_user;"
```

*Note: If you already have these set up, ensure the credentials match those in `services/ml/.env`.*

---

### 🧠 2. Backend Setup (ML Services)

The backend is built with FastAPI and handles AI inference and data management.

1.  **Navigate to the backend directory:**
    ```bash
    cd services/ml
    ```
2.  **Activate the virtual environment:**
    ```bash
    source ../../.venv/bin/activate
    ```
3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Configure environment variables:**
    Ensure `services/ml/.env` exists. You can use `.env.example` as a template.
5.  **Run the server:**
    ```bash
    uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
    ```
    *The API will be available at [http://localhost:8000](http://localhost:8000). The database tables will be created automatically on startup.*

---

### 💻 3. Frontend Setup (Portals)

The project uses a monorepo structure with `pnpm`.

1.  **Install dependencies at the root:**
    ```bash
    # From the LexVision root directory
    pnpm install
    ```
2.  **Run the portals in development mode:**
    You can run all portals or specific ones using the following scripts defined in `package.json`:
    - **Citizen Portal**: `pnpm dev:citizen` (Runs on [http://localhost:5173](http://localhost:5173))
    - **Admin Dashboard**: `pnpm dev:admin` (Runs on [http://localhost:5174](http://localhost:5174))
    - **Police Dashboard**: `pnpm dev:police` (Runs on [http://localhost:5175](http://localhost:5175))

---

### 🛠️ 4. Verification

- **API Health Check**: Visit [http://localhost:8000/health](http://localhost:8000/health)
- **Documentation**: Interactive API docs are at [http://localhost:8000/docs](http://localhost:8000/docs)
- **Redis**: Ensure Redis is running (`redis-cli ping` should return `PONG`).

---

## 📂 Project Structure

- `apps/`: Frontend applications (Citizen, Admin, Police).
- `services/ml/`: FastAPI backend and AI logic.
- `packages/`: Shared packages like UI components and API clients.
- `models/`: YOLOv8 model artifacts.
