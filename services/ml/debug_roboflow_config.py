from __future__ import annotations

import json

try:
    from services.ml.api.env import get_roboflow_config, load_service_env
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.api", "services.ml.api.env"}:
        raise
    from api.env import get_roboflow_config, load_service_env


def main() -> None:
    load_service_env()
    print(json.dumps(get_roboflow_config(), indent=2))


if __name__ == "__main__":
    main()
