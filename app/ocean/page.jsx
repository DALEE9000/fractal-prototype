import TrafficMap from '../traffic-map.jsx';

export const metadata={title:'World ocean | Harbor Ledger',description:'Explore global surface-current forecasts and recent coastal AIS ship reports.'};
export default function Ocean(){
  return <><header><div className="mast"><a className="brand" href="/"><img className="brand-ship" width="32" height="32" src="/harbor-sprite.png" alt=""/>Harbor Ledger</a><a className="account" href="/">Port directory</a></div></header>
    <main className="ocean"><div className="intro"><div><p className="overline">Ocean explorer</p><h1>World ocean</h1></div><img className="harbor-scene" alt="" src="/harbor-night.png"/></div>
    <TrafficMap portId="world"/></main>
    <footer>Current forecasts from the Copernicus Marine Service. AIS coverage depends on shore receivers. For navigation, consult official charts and marine forecasts.</footer></>;
}
