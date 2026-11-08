import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';

/** Lector wedge (USB/Bluetooth) y cámara en navegadores Android con BarcodeDetector nativo. */
export default function BarcodeScanner({ onScan }: { onScan:(value:string)=>void }) {
  const [camera,setCamera]=useState(false),[error,setError]=useState('');
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null);
  const onScanRef=useRef(onScan); onScanRef.current=onScan;
  useEffect(()=>{
    let alive=true,raf=0;
    async function start(){
      try {
        const Detector=(window as any).BarcodeDetector;
        if(!Detector)throw new Error('Este navegador no ofrece lectura de cámara. Use un lector USB/Bluetooth o escriba el código.');
        const wanted=['ean_13','ean_8','upc_a','upc_e','code_128','qr_code'];
        const supported=typeof Detector.getSupportedFormats==='function'?await Detector.getSupportedFormats():wanted;
        const formats=wanted.filter(format=>supported.includes(format));
        if(!formats.length)throw new Error('El navegador no reconoce formatos de producto compatibles. Use un lector USB/Bluetooth.');
        const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        if(!alive){media.getTracks().forEach(t=>t.stop());return;}
        stream.current=media; if(video.current)video.current.srcObject=media; await video.current?.play();
        const detector=new Detector({formats});
        const scan=async()=>{if(!alive||!video.current)return;try{const hits=await detector.detect(video.current);if(hits.length){onScanRef.current(String(hits[0].rawValue||''));setCamera(false);return;}}catch{} raf=requestAnimationFrame(scan);};
        raf=requestAnimationFrame(scan);
      } catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar la cámara');setCamera(false);}
    }
    if(camera)start();
    return()=>{alive=false;cancelAnimationFrame(raf);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
  },[camera]);
  return <div className="flex gap-2 items-center">
    <label className="sr-only" htmlFor="barcode-wedge">Código de barras</label>
    <input id="barcode-wedge" className="input flex-1" placeholder="Escanear código de barras y presionar Enter" onKeyDown={e=>{if(e.key==='Enter'){const value=e.currentTarget.value.trim();if(value){onScan(value);e.currentTarget.value='';}}}} />
    <button type="button" className="btn-secondary whitespace-nowrap" onClick={()=>{setError('');setCamera(x=>!x);}}>{camera?<CameraOff size={16}/>:<Camera size={16}/>} Cámara</button>
    {camera&&<video ref={video} className="fixed bottom-4 right-4 z-50 w-64 rounded-xl border bg-black shadow-xl" muted playsInline />}
    {error&&<span className="text-xs text-red-600" role="status">{error}</span>}
  </div>;
}
