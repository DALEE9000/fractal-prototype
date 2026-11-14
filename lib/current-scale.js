export const currentBands = [
  {below:0.25,label:'<0.25',color:'#659de3'},
  {below:0.5,label:'0.25–<0.5',color:'#49d3f3'},
  {below:1,label:'0.5–<1',color:'#70edb6'},
  {below:2,label:'1–<2',color:'#f4df77'},
  {below:Infinity,label:'2+',color:'#fca3c9'}
];

export const currentColor = speed => currentBands.find(band=>speed<band.below).color;
