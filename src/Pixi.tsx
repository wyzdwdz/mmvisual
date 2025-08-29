import {
  Application,
  BitmapText,
  ColorSource,
  Container,
  Graphics,
  PointData,
  Sprite,
  TextString,
  TextStyle,
  TextStyleOptions,
  Texture,
} from "pixi.js";
import {
  Component,
  createContext,
  createEffect,
  createSignal,
  mergeProps,
  onCleanup,
  onMount,
  ParentComponent,
  Show,
  useContext,
} from "solid-js";

const AppContext = createContext<Application>();
const ContainerContext = createContext<Container>();

const PixiApplication: ParentComponent<{
  background?: ColorSource;
  resizeTo?: HTMLElement | Window;
  antialias?: boolean;
  autoDensity?: boolean;
  resolution?: number;
  ref?: (app: Application | null) => void;
}> = (props) => {
  let refPixi: HTMLDivElement;
  const [app, setApp] = createSignal<Application | null>(null);

  onMount(async () => {
    const pixiApp = new Application();

    await pixiApp.init({
      background: props.background,
      resizeTo: props.resizeTo,
      antialias: props.antialias,
      autoDensity: props.autoDensity,
      resolution: props.resolution,
    });

    setApp(pixiApp);

    if (typeof props.ref === "function") {
      props.ref(app()!);
    }

    refPixi!.appendChild(app()!.canvas);
  });

  onCleanup(() => {
    if (typeof props.ref === "function") {
      props.ref(null);
    }
    app()?.destroy();
  });

  return (
    <>
      <div ref={refPixi!}></div>
      <Show when={app()}>
        <AppContext.Provider value={app()!}>
          {props.children}
        </AppContext.Provider>
      </Show>
    </>
  );
};

const PixiContainer: ParentComponent<{
  x?: number;
  y?: number;
  scale?: string | number | PointData;
  ref?: (container: Container | null) => void;
}> = (props) => {
  const merged = mergeProps({ x: 0, y: 0, scale: 1 }, props);

  const ctxApp = useContext(AppContext);
  const ctxContainer = useContext(ContainerContext);
  const [container, setContainer] = createSignal<Container | null>(null);

  onMount(() => {
    const pixiContainer = new Container();
    setContainer(pixiContainer);

    if (typeof merged.ref === "function") {
      merged.ref(container()!);
    }

    if (ctxContainer) {
      ctxContainer.addChild(container()!);
    } else if (ctxApp) {
      ctxApp.stage.addChild(container()!);
    }
  });

  onCleanup(() => {
    if (typeof merged.ref === "function") {
      merged.ref(null);
    }
    container()?.destroy();
  });

  createEffect(() => {
    if (!container()) return;

    container()!.x = merged.x;
    container()!.y = merged.y;
    container()!.scale = merged.scale;
  });

  return (
    <>
      <Show when={container()}>
        <ContainerContext.Provider value={container()!}>
          {merged.children}
        </ContainerContext.Provider>
      </Show>
    </>
  );
};

const PixiSprite: Component<{
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  texture?: Texture;
  ref?: (sprite: Sprite | null) => void;
}> = (props) => {
  const merged = mergeProps(
    { x: 0, y: 0, width: 0, height: 0, texture: Texture.EMPTY },
    props,
  );

  const ctxApp = useContext(AppContext);
  const ctxContainer = useContext(ContainerContext);
  const [sprite, setSprite] = createSignal<Sprite | null>(null);

  onMount(() => {
    const pixiSprite = Sprite.from(merged.texture);
    setSprite(pixiSprite);

    if (typeof merged.ref == "function") {
      merged.ref(sprite()!);
    }

    if (ctxContainer) {
      ctxContainer.addChild(sprite()!);
    } else if (ctxApp) {
      ctxApp.stage.addChild(sprite()!);
    }
  });

  onCleanup(() => {
    if (typeof merged.ref == "function") {
      merged.ref(null);
    }
    sprite()?.destroy();
  });

  createEffect(() => {
    if (!sprite()) return;

    sprite()!.x = merged.x;
    sprite()!.y = merged.y;
    sprite()!.width = merged.width;
    sprite()!.height = merged.height;
    sprite()!.texture = merged.texture;
  });

  return <></>;
};

const PixiGraphics: Component<{
  draw?: (graphics: Graphics) => void;
  ref?: (graphics: Graphics | null) => void;
}> = (props) => {
  const ctxApp = useContext(AppContext);
  const ctxContainer = useContext(ContainerContext);
  const [graphics, setGraphics] = createSignal<Graphics | null>(null);

  onMount(() => {
    const pixiGraphics = new Graphics();
    setGraphics(pixiGraphics);

    if (typeof props.ref === "function") {
      props.ref(graphics()!);
    }

    if (ctxContainer) {
      ctxContainer.addChild(graphics()!);
    } else if (ctxApp) {
      ctxApp.stage.addChild(graphics()!);
    }
  });

  onCleanup(() => {
    if (typeof props.ref === "function") {
      props.ref(null);
    }

    graphics()?.destroy();
  });

  createEffect(() => {
    if (!graphics()) return;

    if (typeof props.draw === "function") {
      props.draw(graphics()!);
    }
  });

  return <></>;
};

const PixiBitmapText: Component<{
  x?: number;
  y?: number;
  style?: TextStyle | TextStyleOptions;
  text?: TextString;
  ref?: (bitmapText: BitmapText | null) => void;
}> = (props) => {
  const merged = mergeProps({ x: 0, y: 0, style: {}, text: "" }, props);

  const ctxApp = useContext(AppContext);
  const ctxContainer = useContext(ContainerContext);
  const [bitmapText, setBitmapText] = createSignal<BitmapText | null>(null);

  onMount(() => {
    const pixiBitmapText = new BitmapText();
    setBitmapText(pixiBitmapText);

    if (typeof merged.ref === "function") {
      merged.ref(bitmapText()!);
    }

    if (ctxContainer) {
      ctxContainer.addChild(bitmapText()!);
    } else if (ctxApp) {
      ctxApp.stage.addChild(bitmapText()!);
    }
  });

  onCleanup(() => {
    if (typeof merged.ref === "function") {
      merged.ref(null);
    }

    bitmapText()?.destroy();
  });

  createEffect(() => {
    if (!bitmapText()) return;

    bitmapText()!.x = merged.x;
    bitmapText()!.y = merged.y;
    bitmapText()!.style = merged.style;
    bitmapText()!.text = merged.text;
  });

  return <></>;
};

function useApplication(): Application {
  const app = useContext(AppContext);
  if (!app) {
    throw new Error("useApplication must be used within a PixiApplication");
  }
  return app;
}

export {
  PixiApplication,
  PixiContainer,
  PixiSprite,
  PixiGraphics,
  PixiBitmapText,
  useApplication,
};
