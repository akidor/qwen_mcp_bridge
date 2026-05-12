from pathlib import Path


def test_parcel_popup_content_wraps_long_addresses():
    css = Path("web/src/styles.css").read_text(encoding="utf-8")
    popup_rule = css.split(".parcel-popup-wrap .maplibregl-popup-content", 1)[1].split("}", 1)[0]

    assert "white-space: nowrap" not in popup_rule
    assert "max-width:" in popup_rule
    assert "overflow-wrap:" in popup_rule
