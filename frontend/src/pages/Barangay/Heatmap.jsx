import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";
import api from "../../services/api";

function HeatmapLayer({ points }) {
  const map = useMap();

  useEffect(() => {
    let heat;
    let timer;

    const initHeatLayer = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) {
        timer = setTimeout(initHeatLayer, 50);
        return;
      }
      map.invalidateSize();

      const gradients = {
        'Waste Density': {
          0.4: 'blue',
          0.6: 'cyan',
          0.7: 'lime',
          0.8: 'yellow',
          1.0: 'red'
        }
      };

      heat = L.heatLayer(points, {
        radius: 30,
        blur: 20,
        maxZoom: 17,
        gradient: gradients['Waste Density'],
      }).addTo(map);
    };

    initHeatLayer();

    return () => {
      if (heat) map.removeLayer(heat);
      if (timer) clearTimeout(timer);
    };
  }, [map, points]);

  return null;
}

const Heatmap = () => {
  const [addressPoints, setAddressPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.heatmapData();
        if (!cancelled) {
          const mapped = data.map((p) => [Number(p.latitude), Number(p.longitude), Number(p.weight)]);
          setAddressPoints(mapped);
        }
      } catch (err) {
        console.error("Failed to load heatmap data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-12">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">Bot Tracking</h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            Monitor TROID bot locations and activity in your area
          </p>
        </div>
      </header>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col min-h-[550px]">
        <h2 className="text-[17px] font-bold text-slate-900 mb-4">Collective Hotspots</h2>
        <div className="flex-1 rounded-xl overflow-hidden border border-slate-100 relative min-h-[380px]">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Loading map...</div>
          ) : (
            <MapContainer
              center={[16.6332, 120.3191]}
              zoom={15}
              style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
              />
              <HeatmapLayer points={addressPoints} />
            </MapContainer>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Low concentration</span>
          <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 via-emerald-400 via-yellow-400 to-red-500"></div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">High concentration</span>
        </div>
      </div>
    </div>
  );
};

export default Heatmap;
