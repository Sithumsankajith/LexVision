import os
from ultralytics import YOLO

def main():
    # Define paths
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_yaml = os.path.join(base_dir, "datasets", "Helmet", "Helmet Detection.v1i.yolov8", "data.yaml")
    models_dir = os.path.join(base_dir, "models")
    
    # Ensure models directory exists
    os.makedirs(models_dir, exist_ok=True)
    
    print(f"Starting Helmet Detection Training with data configuration: {data_yaml}")
    
    # Load a pretrained YOLOv8 model (Nano version for fast training/inference)
    model = YOLO("yolov8n.pt")
    
    # Train the model
    # Note: Adjust epochs and imgsz according to your hardware capabilities
    results = model.train(
        data=data_yaml,
        epochs=50,       # Number of epochs to train for
        imgsz=640,       # Image size for training
        project=models_dir, # Where to save the results
        name="helmet_v1",   # Name of the current training run
        exist_ok=True    # Overwrite if exists
    )
    
    print(f"Training completed. Model saved to {os.path.join(models_dir, 'helmet_v1')}")

if __name__ == "__main__":
    main()
