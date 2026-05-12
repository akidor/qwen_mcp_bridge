from pathlib import Path


AUTO_LAYER = Path("web/src/map/auto_layer.ts")
STYLES = Path("web/src/styles.css")


def test_parcel_popup_click_fetches_dlof_detail_apis():
    source = AUTO_LAYER.read_text(encoding="utf-8")

    assert 'map.on("click", fillLayerId' in source
    assert "/wmsapi/landuseplan?pnu=" in source
    assert "/wmsapi/landactions?pnu=" in source
    assert "buildParcelDetailContent" in source
    assert "setDOMContent" in source
    assert "setHTML" not in source


def test_single_parcel_layer_preserves_properties_for_detail_popup():
    source = AUTO_LAYER.read_text(encoding="utf-8")

    assert "properties: parcelProperties(parsed)" in source
    assert "attachParcelInfo: true" in source
    assert "options.properties" in source


def test_parcel_detail_popup_has_scrollable_layout():
    css = STYLES.read_text(encoding="utf-8")

    assert ".parcel-detail-popup" in css
    assert "max-height:" in css
    assert "overflow-y: auto" in css
    assert ".parcel-popup-grid" in css
