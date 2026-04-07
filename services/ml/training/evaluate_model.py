from pipeline import create_eval_parser, run_evaluation_pipeline


def main() -> None:
    parser = create_eval_parser()
    args = parser.parse_args()
    summary = run_evaluation_pipeline(args)

    print(f"Completed evaluation: {summary['run_name']}")
    for split_name, payload in summary["evaluation"]["splits"].items():
        metrics = payload["metrics"]
        print(
            f"{split_name.title()} metrics | "
            f"precision={metrics['precision']} recall={metrics['recall']} "
            f"mAP@50={metrics['map50']} mAP@50-95={metrics['map50_95']}"
        )


if __name__ == "__main__":
    main()
