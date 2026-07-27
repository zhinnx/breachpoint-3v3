const fs=require('fs');const zlib=require('zlib');
function readPNG(p){const b=fs.readFileSync(p);let o=8;let w,h,idat=[];
while(o<b.length){const len=b.readUInt32BE(o);const type=b.toString('ascii',o+4,o+8);
 if(type==='IHDR'){w=b.readUInt32BE(o+8);h=b.readUInt32BE(o+12);}
 if(type==='IDAT')idat.push(b.slice(o+8,o+8+len));
 o+=12+len;}
const raw=zlib.inflateSync(Buffer.concat(idat));
const bpp=4;const stride=w*bpp;const out=Buffer.alloc(h*stride);let pos=0;
for(let y=0;y<h;y++){const ft=raw[pos++];const line=raw.slice(pos,pos+stride);pos+=stride;
 for(let x=0;x<stride;x++){const a=x>=bpp?out[y*stride+x-bpp]:0;const bb=y>0?out[(y-1)*stride+x]:0;const c=(x>=bpp&&y>0)?out[(y-1)*stride+x-bpp]:0;let v=line[x];
  if(ft===1)v+=a;else if(ft===2)v+=bb;else if(ft===3)v+=(a+bb)>>1;else if(ft===4){const pa=Math.abs(bb-c),pb=Math.abs(a-c),pc=Math.abs(a+bb-2*c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?bb:c);}
  out[y*stride+x]=v&255;}}
return {w,h,px:out};}
for(const f of process.argv.slice(2)){
 try{const {w,h,px}=readPNG('tests/'+f+'.png');let sum=0,n=0,bright=0,dark=0;
 for(let y=Math.floor(h*0.28);y<h*0.92;y+=3)for(let x=Math.floor(w*0.2);x<w*0.85;x+=3){
  const i=y*w*4+x*4;const lum=0.2126*px[i]+0.7152*px[i+1]+0.0722*px[i+2];
  sum+=lum;n++;if(lum>60)bright++;if(lum<12)dark++;}
 console.log(f.padEnd(20),'avgLum='+(sum/n).toFixed(1).padStart(6),'  %bright='+((bright/n)*100).toFixed(1).padStart(5),'  %near-black='+((dark/n)*100).toFixed(1));
 }catch(e){console.log(f,'ERR',e.message);}}
