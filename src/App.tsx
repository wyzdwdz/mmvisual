import { Switch } from "@kobalte/core/switch";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { throttle } from "lodash";
import mime from "mime";
import { Container, TextStyle, Texture } from "pixi.js";
import { Component, createEffect, createSignal, For, Show } from "solid-js";
import { Device, Plan } from "./Interface";
import {
  PixiApplication,
  PixiBitmapText,
  PixiContainer,
  PixiGraphics,
  PixiSprite,
  useApplication,
} from "./Pixi";
import "@fontsource/fira-mono";
import "./style.css";

const GLOBAL_SCALE = 60;

const RecordSwitch: Component<object> = () => {
  const changeRecord = (isChecked: boolean) => {
    if (isChecked) {
      invoke("start_record");
    } else {
      invoke("stop_record");
    }
  };

  return (
    <>
      <Switch
        class="inline-flex items-center cursor-pointer"
        onChange={changeRecord}
      >
        <Switch.Input class="sr-only peer" />
        <Switch.Control
          class="
            relative w-11 h-6 bg-gray-200
            peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 
            rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full 
            rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white 
            after:content-[''] after:absolute after:top-[2px] after:start-[2px] 
            after:bg-white after:border-gray-300 after:border after:rounded-full 
            after:h-5 after:w-5 after:transition-all dark:border-gray-600 
            peer-checked:bg-red-600 dark:peer-checked:bg-red-600
          "
        />
        <Switch.Label class="ms-3 mb-1 text-m font-medium font-[Fira_Mono] text-gray-900 dark:text-gray-300">
          Record
        </Switch.Label>
      </Switch>
    </>
  );
};

const MMStage: Component<{ devices: Device[]; plan: Plan }> = (props) => {
  const app = useApplication();

  const [refContainer, setRefContainer] = createSignal<Container | null>(null);
  let isDragging = false;

  const [mouseScale, setMouseScale] = createSignal(1);

  createEffect(() => {
    const onDragStart = (event: MouseEvent) => {
      event.preventDefault();

      if (event.button !== 0) return;
      isDragging = true;
    };

    const onDragMove = (event: MouseEvent) => {
      event.preventDefault();

      if (event.button !== 0) return;

      if (!isDragging) return;

      if (!refContainer()) return;
      const container = refContainer()!;

      container.x = container.x + event.movementX;
      container.y = container.y + event.movementY;
    };

    const onDragEnd = (event: MouseEvent) => {
      event.preventDefault();

      if (event.button !== 0) return;
      isDragging = false;
    };

    app.canvas.addEventListener("mousedown", onDragStart);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);

    return () => {
      app.canvas.removeEventListener("mousedown", onDragStart);
      window.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("mouseup", onDragEnd);
    };
  });

  createEffect(() => {
    if (!refContainer()) return;
    const container = refContainer()!;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const scaleBy = 1.15;
      const pointerX = e.x - app.screen.x;
      const pointerY = e.y - app.screen.y;

      const oldScale = container.scale.x;
      const newScale = Math.max(
        Math.min(e.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy, 10),
        0.1,
      );

      container.x = pointerX - ((pointerX - container.x) * newScale) / oldScale;
      container.y = pointerY - ((pointerY - container.y) * newScale) / oldScale;
      container.scale = newScale;

      setMouseScale(newScale);
    };

    const throttledWheel = throttle(handleWheel, 50, {
      leading: true,
      trailing: false,
    });

    app.canvas.addEventListener("wheel", throttledWheel, { passive: false });

    return () => {
      app.canvas.removeEventListener("wheel", throttledWheel);
    };
  });

  return (
    <>
      <PixiContainer
        x={app.screen.width / 2}
        y={app.screen.height / 2}
        ref={setRefContainer}
      >
        <FloorPlan
          x={props.plan.x}
          y={-props.plan.y}
          scale_pixels_per_m={props.plan.scale_pixels_per_m}
          data={props.plan.data}
          ext={props.plan.ext}
        />
        <For each={props.devices}>
          {(device) => (
            <SensorMarker container_scale={mouseScale()} {...device} />
          )}
        </For>
      </PixiContainer>
    </>
  );
};

const FloorPlan: Component<{
  x: number;
  y: number;
  scale_pixels_per_m: number;
  data: Uint8Array;
  ext: string;
}> = (props) => {
  const [texture, setTexture] = createSignal(Texture.EMPTY);

  createEffect(() => {
    if (!props.data?.length) return;

    const mime_type = mime.getType(props.ext);
    if (!mime_type) return;

    const createImage = async () => {
      const buffer =
        props.data instanceof Uint8Array
          ? props.data
          : new Uint8Array(props.data);
      const blob = new Blob([buffer], { type: mime_type });
      const imageUrl = URL.createObjectURL(blob);

      const img = new Image();

      try {
        img.src = imageUrl;
        await img.decode();

        const texture = Texture.from(img);
        setTexture(texture);
      } catch (error) {
        console.error("Image loading failed", error);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }

      return () => {
        URL.revokeObjectURL(img.src);
      };
    };

    createImage();
  });

  return (
    <>
      <PixiSprite
        x={props.x * GLOBAL_SCALE}
        y={props.y * GLOBAL_SCALE}
        width={(texture().width / props.scale_pixels_per_m) * GLOBAL_SCALE}
        height={(texture().height / props.scale_pixels_per_m) * GLOBAL_SCALE}
        texture={texture()}
      />
    </>
  );
};

const SensorMarker: Component<{
  x: number;
  y: number;
  q: number;
  is_hedge: boolean;
  container_scale: number;
}> = (props) => {
  const [keyScale, setKeyScale] = createSignal(1);
  const [refContainer, setRefContainer] = createSignal<Container | null>(null);

  const textStyle = new TextStyle({
    fontFamily: "Fira Mono",
    fontSize: 12,
  });

  const text =
    "x: " +
    props.x.toFixed(2) +
    "\ny: " +
    props.y.toFixed(2) +
    "\nq: " +
    props.q;

  createEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();

      if (!refContainer()) return;
      const container = refContainer()!;

      if (event.key == "-" && container.scale.x > 0.2) {
        setKeyScale((scale) => scale - 0.1);
      } else if (event.key == "+" && container.scale.x < 5) {
        setKeyScale((scale) => scale + 0.1);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  return (
    <>
      <PixiContainer
        x={props.x * GLOBAL_SCALE}
        y={-props.y * GLOBAL_SCALE}
        scale={1 + keyScale()}
        ref={setRefContainer}
      >
        <PixiGraphics
          draw={(graphics) => {
            graphics.clear();
            graphics.setFillStyle({ color: props.is_hedge ? "red" : "blue" });
            graphics.circle(0, 0, 4);
            graphics.fill();
          }}
        />
        <Show when={props.is_hedge}>
          <PixiBitmapText x={-50} y={-40} style={textStyle} text={text} />
        </Show>
      </PixiContainer>
    </>
  );
};

function App() {
  const [devices, setDevices] = createSignal<Device[]>([]);
  const [plan, setPlan] = createSignal<Plan | null>(null);

  createEffect(() => {
    const unlisten = listen<string>("log-message", (event) => {
      console.log(`Log: ${event.payload}`);
    });

    return () => {
      unlisten.then((f) => f());
    };
  });

  createEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") {
        return;
      }

      if (!event.payload.paths[0]) {
        return;
      }

      invoke<[Device[], Plan | null]>("parse_map", {
        path: event.payload.paths[0],
      }).then(([tr_devices, tr_plan]) => {
        setDevices(tr_devices);
        setPlan(tr_plan);
      });

      invoke("mmstart");
    });

    return () => {
      unlisten.then();
    };
  });

  createEffect(() => {
    const intervalId = setInterval(() => {
      invoke<Device[]>("read_devices").then((tr_devices) => {
        setDevices((prevDevices) => {
          const newDevices = [...prevDevices];
          let hasChanged = false;

          tr_devices.forEach((tr_device) => {
            if (tr_device.q < 50) return;

            const index = prevDevices.findIndex(
              (d) => d.address === tr_device.address,
            );

            if (index !== -1) {
              const existing = prevDevices[index];

              const deviceChanged =
                Math.abs(existing.x - tr_device.x) > 0.01 ||
                Math.abs(existing.y - tr_device.y) > 0.01 ||
                existing.q !== tr_device.q ||
                existing.is_hedge !== tr_device.is_hedge;
              if (deviceChanged) {
                newDevices[index] = tr_device;
                hasChanged = true;
              }
            } else {
              newDevices.push(tr_device);
              hasChanged = true;
            }
          });

          return hasChanged ? newDevices : prevDevices;
        });
      });
    }, 10);

    return () => {
      clearInterval(intervalId);
    };
  });

  return (
    <>
      <Show when={devices().length > 0 && plan()}>
        <PixiApplication
          background={"#ffffffff"}
          resizeTo={window}
          antialias={true}
          autoDensity={true}
          resolution={window.devicePixelRatio}
        >
          <MMStage devices={devices()} plan={plan()!} />
        </PixiApplication>
      </Show>
      <div
        style={{
          position: "absolute",
          top: "30px",
          right: "30px",
          "z-index": 10,
        }}
        class="scale-110"
      >
        <RecordSwitch />
      </div>
    </>
  );
}

export default App;
