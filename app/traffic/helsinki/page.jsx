import TrafficMap from '../../traffic-map.jsx';
export const metadata={title:'Helsinki live AIS | Harbor Ledger'};
export default function Helsinki(){
  return <><header><div className="mast"><a className="brand" href="/"><span className="mark" aria-hidden="true">≋</span>Harbor Ledger</a><a className="account" href="/">Port directory</a></div></header>
    <main><div className="intro"><div><p className="overline">Finland · Gulf of Finland</p><h1>Helsinki ship tracker</h1></div><p className="intro-note">Public AIS reports from the harbor and its approaches.<br/>Select a vessel to inspect its latest reported position.</p></div>
    <div className="tracker"><TrafficMap portId="helsinki"/></div></main><footer>Source: Fintraffic / digitraffic.fi, license CC BY 4.0. Reports older than 15 minutes drop off the map.</footer></>;
}
