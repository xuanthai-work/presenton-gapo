import copy

from utils.llm_utils import extract_structured_content, serialize_structured_content
from utils.schema_utils import (
    ensure_array_schemas_have_items,
    get_schema_validation_errors,
)


def test_extract_structured_content_from_json_text():
    payload = extract_structured_content('{"slides": [{"content": "A"}]}')
    assert payload == {"slides": [{"content": "A"}]}
    assert type(payload) is dict
    assert type(payload["slides"]) is list
    assert type(payload["slides"][0]) is dict


def test_extract_structured_content_nested_values_are_deepcopyable():
    payload = extract_structured_content(
        '{"component": {"title": "Hello", "items": [{"x": 1}]}}'
    )

    assert type(payload) is dict
    assert type(payload["component"]) is dict
    assert type(payload["component"]["items"]) is list
    assert type(payload["component"]["items"][0]) is dict
    assert copy.deepcopy(payload) == payload


def test_serialize_structured_content_prefers_json_serialization():
    serialized = serialize_structured_content({"slides": [{"content": "A"}]})
    assert serialized == '{"slides": [{"content": "A"}]}'


def test_get_schema_validation_errors_reports_path_and_message():
    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string", "maxLength": 5},
        },
        "required": ["title"],
        "additionalProperties": False,
    }
    errors = get_schema_validation_errors(schema, {"title": "too long title"}, strict=False)
    assert errors
    assert any("too long" in e.lower() for e in errors)


def test_ensure_array_schemas_have_items_adds_missing_items_recursively():
    schema = {
        "type": "object",
        "properties": {
            "slides": {
                "type": "array",
                "items": {"type": "object", "properties": {"tags": {"type": "array"}}},
            }
        },
    }

    fixed = ensure_array_schemas_have_items(schema)

    assert fixed["properties"]["slides"]["items"]["properties"]["tags"]["items"] == {
        "type": "string"
    }
