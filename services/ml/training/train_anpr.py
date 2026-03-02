import argparse
import os
import json
from ultralytics import YOLO

def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 for ANPR (Academic Tier)")
    parser.add_argument("--epochs", type=int, default=50, help="Number of epochs to train for")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size for training")
    parser.add_argument("--device", type=str, default="", help="Device to run training on (e.g., cpu, cuda:0)")
    parser.add_argument("--version", type=str, default="v1.0.0", help="Model semantic version tag")
    args = parser.parse_args()

    # Define paths
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_yaml = os.path.join(base_dir, "datasets", "NumberPlate", "Automatic Plate Number Recognition.v4i.yolov8", "data.yaml")
    models_dir = os.path.join(base_dir, "models")
    model_name = f"anpr_{args.version}"
    
    # Ensure models directory exists
    os.makedirs(models_dir, exist_ok=True)
    
    print(f"Starting ANPR Training [{args.version}] with data: {data_yaml}")
    
    # Load a pretrained YOLOv8 model
    model = YOLO("yolov8n.pt")
    
    # Train the model with explicit academic augmentations and metric logging
    results = model.train(
        data=data_yaml,
        epochs=args.epochs,
        imgsz=args.imgsz,
        project=models_dir, 
        name=model_name,     
        exist_ok=True,
        device=args.device if args.device else None,
        save=True,          
        save_period=-1,     # Don't save intermediate epochs
        val=True,           
        hsv_h=0.015,        
        hsv_s=0.7,          
        hsv_v=0.4,          
        degrees=10.0,       
        translate=0.1,      
        scale=0.5,          
        shear=0.0,          
        perspective=0.0,    
        flipud=0.0,         
        fliplr=0.5,         
        mosaic=1.0,         
        mixup=0.1,          
    )
    
    print("\\n--- Commencing Academic Metric Evaluation ---")
    metrics = model.val()
    
    mAP50 = metrics.box.map50
    mAP50_95 = metrics.box.map
    
    print(f"Final Model Metrics (Validation Data):")
    print(f"- mAP@50:    {mAP50:.4f}")
    print(f"- mAP@50-95: {mAP50_95:.4f}")
    
    # Export metrics metadata json alongside best.pt to track performance
    metadata_path = os.path.join(models_dir, model_name, "metrics_metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump({
            "version": args.version,
            "epochs": args.epochs,
            "imgsz": args.imgsz,
            "mAP50": mAP50,
            "mAP50-95": mAP50_95,
            "augmentations": {
                "mosaic": 1.0,
                "mixup": 0.1,
                "hsv": True,
                "flip": "left-right"
            }
        }, f, indent=4)
        
    print(f"Training completed. Best model saved to {os.path.join(models_dir, model_name, 'weights', 'best.pt')}")

if __name__ == "__main__":
    main()
