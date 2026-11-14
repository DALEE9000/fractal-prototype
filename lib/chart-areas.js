export const charts = {
  'new-york': { region:'usegc', bounds:[-74.35,40.20,-73.48,40.92], station:[40.701,-74.014], buoy:[40.368,-73.701], labels:[['Manhattan',40.757,-73.978],['Brooklyn',40.64,-73.974],['Staten Island',40.565,-74.14],['Sandy Hook',40.459,-74.002]] },
  boston: { region:'usegc', bounds:[-71.18,42.13,-70.45,42.53], station:[42.355,-71.05], buoy:[42.346,-70.651], labels:[['Boston',42.352,-71.069],['Winthrop',42.377,-70.98],['Hull',42.287,-70.88],['Scituate',42.197,-70.725]] },
  'san-francisco': { region:'uswc', bounds:[-123.00,37.54,-122.19,38.035], station:[37.806,-122.466], buoy:[37.75,-122.838], labels:[['San Francisco',37.75,-122.43],['Oakland',37.809,-122.268],['Sausalito',37.86,-122.49],['Pacifica',37.614,-122.49]] },
  helsinki: {bounds:[24.76,59.995,25.20,60.235], labels:[['Helsinki',60.173,24.933],['Suomenlinna',60.146,24.989],['Lauttasaari',60.163,24.872]]}
};

// Additional map context fills wide screens beyond the tightly scoped NOAA request.
export function basemapBounds([west,south,east,north]) {
  const x=(east-west)*1.15, y=(north-south)*0.38;
  return [west-x,south-y,east+x,north+y];
}
