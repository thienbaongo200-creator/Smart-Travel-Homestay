import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { vnd } from "../utils";

function Fit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

const pin = (label, active) =>
  L.divIcon({ className: "", html: `<div class="price-pin ${active ? "active" : ""}">${label}</div>`, iconSize: [0, 0] });

export default function MapView({ rooms, hoverId, onHover }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rooms) {
      if (r.lat == null || r.lng == null) continue;
      const key = `${r.lat},${r.lng}`;
      if (!m.has(key)) m.set(key, { key, lat: Number(r.lat), lng: Number(r.lng), rooms: [] });
      m.get(key).rooms.push(r);
    }
    return [...m.values()];
  }, [rooms]);
  const points = useMemo(() => groups.map((g) => [g.lat, g.lng]), [groups]);

  return (
    <MapContainer center={[11.94, 108.45]} zoom={12} scrollWheelZoom style={{ height: "100%", minHeight: 420 }}>
      <TileLayer
        attribution="Tiles &copy; Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
      />
      <ResizeFix />
      <Fit points={points} />
      {groups.map((g) => {
        const min = Math.min(...g.rooms.map((r) => Number(r.total)));
        const active = g.rooms.some((r) => r.room_id === hoverId);
        return (
          <Marker
            key={g.key}
            position={[g.lat, g.lng]}
            icon={pin(`${Math.round(min / 1000)}k`, active)}
            eventHandlers={{ mouseover: () => onHover?.(g.rooms[0].room_id), mouseout: () => onHover?.(null) }}
          >
            <Popup>
              <b>{g.rooms[0].homestay}</b>
              {g.rooms.map((r) => (
                <div key={r.room_id}>{r.room}: {vnd(r.total)}</div>
              ))}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}