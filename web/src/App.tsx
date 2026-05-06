import { useState } from "react";
import MapView from "./map/MapView";
import { BasemapKind } from "./map/basemaps";
import FloatingPanel from "./panel/FloatingPanel";

export default function App() {
  const [basemap, setBasemap] = useState<BasemapKind>("white");
  const [mapInstance, setMapInstance] = useState<any>(null);

  return (
    <>
      <MapView
        basemap={basemap}
        onReady={(map) => setMapInstance(map)}
      />
      <FloatingPanel
        map={mapInstance}
        basemap={basemap}
        setBasemap={setBasemap}
      />
    </>
  );
}
