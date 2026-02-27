import argparse
import os
from ultralytics import YOLO

def main():
    parser = argparse.ArgumentParser(description="Run YOLOv8 inference")
    parser.add_argument("--model", type=str, required=True, help="Path to the trained YOLOv8 model (.pt) in the models directory")
    parser.add_argument("--source", type=str, required=True, help="Path to input image, video, or directory")
    parser.add_argument("--device", type=str, default="", help="Device to run inference on (e.g., cpu, cuda:0)")
    args = parser.parse_args()

    # Define paths
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    # Handle absolute vs relative model path
    model_path = args.model
    if not os.path.isabs(model_path):
        model_path = os.path.join(base_dir, "models", args.model)
        
    if not os.path.exists(model_path):
        print(f"Error: Model not found at {model_path}")
        return

    # Load model
    print(f"Loading model: {model_path}")
    model = YOLO(model_path)
    
    # Run inference
    print(f"Running inference on source: {args.source}")
    results = model.predict(
        source=args.source,
        save=True,          # Save the result with bounding boxes
        project=os.path.join(base_dir, "inference"),
        name="results",     # Directory inside project where results are saved
        exist_ok=True,
        device=args.device if args.device else None
    )
    
    print(f"Inference completed. Results saved to {os.path.join(base_dir, 'inference', 'results')}")

if __name__ == "__main__":
    main()
