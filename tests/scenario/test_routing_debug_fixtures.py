import pytest

from tests.scenario.routing_debug_fixture_runner import (
    assert_routing_debug_case,
    load_routing_debug_cases,
)


@pytest.mark.parametrize(
    "case",
    load_routing_debug_cases("routing_debug_cases.json"),
    ids=lambda case: case["name"],
)
def test_routing_debug_fixture_contract(case):
    assert_routing_debug_case(case)
