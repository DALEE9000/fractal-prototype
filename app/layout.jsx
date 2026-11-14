import 'leaflet/dist/leaflet.css';
import './style.css';
export const metadata = { title: 'Harbor Ledger | Port & sea conditions', description: 'Compare harbor water levels with offshore buoy observations and keep a personal watchlist of ports.' };
export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
