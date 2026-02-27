import argparse
import os
from ultralytics import YOLO

def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 for Helmet Detection")
    parser.add_argument("--epochs", type=int, default=50, help="Number of epochs to train for")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size for training")
    parser.add_argument("--device", type=str, default="", help="Device to run training on (e.g., cpu, cuda:0)")
    args = parser.parse_args()

    # Define paths
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_yaml = os.path.join(base_dir, "datasets", "Helmet", "Helmet Detection.v1i.yolov8", "data.yaml")
    models_dir = os.path.join(base_dir, "models")
    
    # Ensure models directory exists
    os.makedirs(models_dir, exist_ok=True)
    
    print(f"Starting Helmet Detection Training with data configuration: {data_yaml}")
    print(f"Parameters: epochs={args.epochs}, imgsz={args.imgsz}, device={args.device if args.device else 'auto'}")
    
    # Load a pretrained YOLOv8 model (Nano version for fast training/inference)
    model = YOLO("yolov8n.pt")
    
    # Train the model
    results = model.train(
        data=data_yaml,
        epochs=args.epochs,
        imgsz=args.imgsz,
        project=models_dir,
        name="helmet_v1",
        exist_ok=True,
        device=args.device if args.device else None
    )
    
    print(f"Training completed. Model saved to {os.path.join(models_dir, 'helmet_v1')}")

if __name__ == "__main__":
    main()
