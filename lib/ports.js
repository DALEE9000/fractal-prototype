export const ports = [
  { id: 'new-york', name: 'New York Harbor', region: 'New York · Atlantic', harbor: 'The Battery', tide: '8518750', buoy: '44065', offshore: 'New York Harbor entrance', coordinates: '40.70° N · 74.01° W' },
  { id: 'boston', name: 'Boston Harbor', region: 'Massachusetts · Atlantic', harbor: 'Boston', tide: '8443970', buoy: '44013', offshore: 'Boston approaches', coordinates: '42.35° N · 71.05° W' },
  { id: 'san-francisco', name: 'San Francisco Bay', region: 'California · Pacific', harbor: 'San Francisco', tide: '9414290', buoy: '46026', offshore: 'West of San Francisco', coordinates: '37.81° N · 122.47° W' }
];
export const findPort = id => ports.find(port => port.id === id);
