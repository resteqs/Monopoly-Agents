import importlib


def test_package_and_engine_import():
    import monopoly
    import slopoly_rl

    assert monopoly is not None
    assert slopoly_rl is not None


def test_component_modules_import():
    for name in [
        "collector",
        "network",
        "reward",
        "gae",
        "ppo",
        "evaluation",
        "probes",
        "config",
        "stubs",
    ]:
        importlib.import_module(f"slopoly_rl.{name}")
