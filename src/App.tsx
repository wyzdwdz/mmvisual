import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Circle, Image, Layer, Stage } from "react-konva";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./App.css";
import useImage from "use-image";

interface Device {
  address: number;
  is_hedge: boolean;
  x: number;
  y: number;
  q: number;
}

function SensorMarker({
  x,
  y,
  q,
  is_hedge,
}: {
  x: number;
  y: number;
  q: number;
  is_hedge: boolean;
}) {
  return <Circle x={x} y={y} radius={8} fill={is_hedge ? "red" : "blue"} />;
}

function FloorPlan({ x, y, scale }: { x: number; y: number; scale: number }) {
  const [planImage] = useImage("./public/S2 FL2 map.jpg");
  return <Image x={x} y={y} scaleX={scale} scaleY={scale} image={planImage} />;
}

function VisualStage({ devices }: { devices: Device[] }) {
  const refStage = useRef<Konva.Stage>(null);
  useEffect(() => {
    const stage = refStage.current;

    const handleResize = () => {
      stage?.setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <Stage width={window.innerWidth} height={window.innerHeight} ref={refStage}>
      <Layer>
        <FloorPlan x={-7.136} y={8.429} scale={1} />
        {devices.map((device) => (
          <SensorMarker
            key={device.address}
            x={device.x}
            y={device.y}
            q={device.q}
            is_hedge={device.is_hedge}
          />
        ))}
      </Layer>
    </Stage>
  );
}

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    const unlisten = listen<string>("log-message", (event) => {
      console.log(`Log: ${event.payload}`);
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    invoke("mmstart");
  }, []);

  useEffect(() => {
    setInterval(() => {
      invoke<Device[]>("read_devices").then((devices) => {
        setDevices(devices);
      });
    }, 50);
  }, []);

  return (
    <>
      <VisualStage devices={devices} />
    </>
  );
}

// shift_x_m = -7.136
// shift_y_m = 8.429
// scale_pixels_per_m = 54.112
