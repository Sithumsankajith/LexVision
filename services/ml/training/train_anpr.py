from pipeline import create_train_parser, run_training_pipeline


def main() -> None:
    parser = create_train_parser("anpr")
    parser.set_defaults(version="v9.0.0")
    args = parser.parse_args()
    summary = run_training_pipeline("anpr", args)

    print(f"Completed run: {summary['run_name']}")
    print(f"Saved training report: {summary['artifacts']['reports'][0]}")
    for split_name, payload in summary["evaluations"].items():
        metrics = payload["metrics"]
        print(
            f"{split_name.title()} metrics | "
            f"precision={metrics['precision']} recall={metrics['recall']} "
            f"mAP@50={metrics['map50']} mAP@50-95={metrics['map50_95']}"
        )


if __name__ == "__main__":
    main()
