import { useEffect, useRef, memo } from 'react';
import {
  Scene,
  OrthographicCamera,
  WebGLRenderer,
  PlaneGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
  Vector2
} from 'three';

import './FloatingLines.css';

const vertexShader = `
precision highp float;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3  iResolution;
uniform float animationSpeed;

uniform bool enableTop;
uniform bool enableMiddle;
uniform bool enableBottom;

uniform int topLineCount;
uniform int middleLineCount;
uniform int bottomLineCount;

uniform float topLineDistance;
uniform float middleLineDistance;
uniform float bottomLineDistance;

uniform vec3 topWavePosition;
uniform vec3 middleWavePosition;
uniform vec3 bottomWavePosition;

uniform vec2 iMouse;
uniform bool interactive;
uniform float bendRadius;
uniform float bendStrength;
uniform float bendInfluence;

uniform bool parallax;
uniform float parallaxStrength;
uniform vec2 parallaxOffset;

uniform vec3 lineGradient[8];
uniform int lineGradientCount;

const vec3 BLACK = vec3(0.0);
const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;
const vec3 BLUE  = vec3(47.0,  75.0, 162.0) / 255.0;

mat2 rotate(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

vec3 background_color(vec2 uv) {
  vec3 col = vec3(0.0);

  float y = sin(uv.x - 0.2) * 0.3 - 0.1;
  float m = uv.y - y;

  col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));
  col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));
  return col * 0.5;
}

vec3 getLineColor(float t, vec3 baseColor) {
  if (lineGradientCount <= 0) {
    return baseColor;
  }

  vec3 gradientColor;

  if (lineGradientCount == 1) {
    gradientColor = lineGradient[0];
  } else {
    float clampedT = clamp(t, 0.0, 0.9999);
    float scaled = clampedT * float(lineGradientCount - 1);
    int idx = int(floor(scaled));
    float f = fract(scaled);
    int idx2 = min(idx + 1, lineGradientCount - 1);

    vec3 c1 = lineGradient[idx];
    vec3 c2 = lineGradient[idx2];

    gradientColor = mix(c1, c2, f);
  }

  return gradientColor * 0.5;
}

  float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {
  float time = iTime * animationSpeed;

  float x_offset   = offset;
  float x_movement = time * 0.1;
  float amp        = 0.3 + 0.1 * sin(time * 0.5); // Smooth amplitude variation for infinite flow
  float y          = sin(uv.x * 2.0 + x_offset + x_movement) * amp;

  if (shouldBend) {
    vec2 d = screenUv - mouseUv;
    float influence = exp(-dot(d, d) * bendRadius); // radial falloff around cursor
    float bendOffset = (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
    y += bendOffset;
  }

  float m = uv.y - y;
  return 0.0175 / max(abs(m) + 0.01, 1e-3) + 0.01;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  baseUv.y *= -1.0;

  if (parallax) {
    baseUv += parallaxOffset;
  }

  vec3 col = vec3(0.0);

  vec3 b = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);

  vec2 mouseUv = vec2(0.0);
  if (interactive) {
    mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y;
    mouseUv.y *= -1.0;
  }

  if (enableBottom) {
    for (int i = 0; i < bottomLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(bottomLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = bottomWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      col += lineCol * wave(
        ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y),
        1.5 + 0.2 * fi,
        baseUv,
        mouseUv,
        interactive
      ) * 0.2;
    }
  }

  if (enableMiddle) {
    for (int i = 0; i < middleLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(middleLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = middleWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      col += lineCol * wave(
        ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y),
        2.0 + 0.15 * fi,
        baseUv,
        mouseUv,
        interactive
      );
    }
  }

  if (enableTop) {
    for (int i = 0; i < topLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(topLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = topWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      ruv.x *= -1.0;
      col += lineCol * wave(
        ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y),
        1.0 + 0.2 * fi,
        baseUv,
        mouseUv,
        interactive
      ) * 0.1;
    }
  }

  fragColor = vec4(col, 1.0);
}

void main() {
  vec4 color = vec4(0.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}
`;


interface FloatingLinesProps {
  linesGradient?: string[];
  enabledWaves?: ('top' | 'middle' | 'bottom')[];
  lineCount?: number | number[];
  lineDistance?: number | number[];
  topWavePosition?: { x: number; y: number; rotate: number };
  middleWavePosition?: { x: number; y: number; rotate: number };
  bottomWavePosition?: { x: number; y: number; rotate: number };
  animationSpeed?: number;
  interactive?: boolean;
  bendRadius?: number;
  bendStrength?: number;
  mouseDamping?: number;
  parallax?: boolean;
  parallaxStrength?: number;
  mixBlendMode?: React.CSSProperties['mixBlendMode'];
}

const FloatingLines = memo(function FloatingLines({
  linesGradient,
  enabledWaves = ['top', 'middle', 'bottom'],
  lineCount = [6],
  lineDistance = [5],
  topWavePosition,
  middleWavePosition,
  bottomWavePosition = { x: 2.0, y: -0.7, rotate: -1 },
  animationSpeed = 1,
  interactive = true,
  bendRadius = 5.0,
  bendStrength = -0.5,
  mouseDamping = 0.05,
  parallax = true,
  parallaxStrength = 0.2,
  mixBlendMode = 'screen'
}: FloatingLinesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<OrthographicCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const uniformsRef = useRef<Record<string, { value: any }>>(null);
  const startTimeRef = useRef<number>(0);

  // Функция для преобразования hex цвета в vec3
  const hexToVec3 = (hex: string) => {
    let value = hex.trim();
    if (value.startsWith('#')) {
      value = value.slice(1);
    }

    let r = 255;
    let g = 255;
    let b = 255;

    if (value.length === 3) {
      r = parseInt(value[0] + value[0], 16);
      g = parseInt(value[1] + value[1], 16);
      b = parseInt(value[2] + value[2], 16);
    } else if (value.length === 6) {
      r = parseInt(value.slice(0, 2), 16);
      g = parseInt(value.slice(2, 4), 16);
      b = parseInt(value.slice(4, 6), 16);
    }

    return new Vector3(r / 255, g / 255, b / 255);
  };

  const targetMouseRef = useRef(new Vector2(-1000, -1000));
  const currentMouseRef = useRef(new Vector2(-1000, -1000));
  const targetInfluenceRef = useRef(0);
  const currentInfluenceRef = useRef(0);
  const targetParallaxRef = useRef(new Vector2(0, 0));
  const currentParallaxRef = useRef(new Vector2(0, 0));

  const getLineCount = (waveType: 'top' | 'middle' | 'bottom') => {
    if (typeof lineCount === 'number') return lineCount;
    if (!enabledWaves.includes(waveType)) return 0;
    const index = enabledWaves.indexOf(waveType);
    return lineCount[index] ?? 6;
  };

  const getLineDistance = (waveType: 'top' | 'middle' | 'bottom') => {
    if (typeof lineDistance === 'number') return lineDistance;
    if (!enabledWaves.includes(waveType)) return 0.1;
    const index = enabledWaves.indexOf(waveType);
    return lineDistance[index] ?? 0.1;
  };

  const topLineCount = enabledWaves.includes('top') ? getLineCount('top') : 0;
  const middleLineCount = enabledWaves.includes('middle') ? getLineCount('middle') : 0;
  const bottomLineCount = enabledWaves.includes('bottom') ? getLineCount('bottom') : 0;

  const topLineDistance = enabledWaves.includes('top') ? getLineDistance('top') * 0.01 : 0.01;
  const middleLineDistance = enabledWaves.includes('middle') ? getLineDistance('middle') * 0.01 : 0.01;
  const bottomLineDistance = enabledWaves.includes('bottom') ? getLineDistance('bottom') * 0.01 : 0.01;

  // Инициализация WebGL сцены - один раз при монтировании
  useEffect(() => {
    if (!containerRef.current) return;

    console.log('🎨 Initializing FloatingLines WebGL scene');

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
    renderer.domElement.style.pointerEvents = 'auto';
    containerRef.current.appendChild(renderer.domElement);

    const geometry = new PlaneGeometry(2, 2);

    // Создаем uniforms с начальными значениями
    // Создаем массив цветов для шейдера (8 элементов максимум)
    const MAX_GRADIENT_STOPS = 8;
    const gradientColors = Array.from({ length: MAX_GRADIENT_STOPS }, () => new Vector3(1, 1, 1));

    if (linesGradient && linesGradient.length > 0) {
      const stops = linesGradient.slice(0, MAX_GRADIENT_STOPS);
      stops.forEach((hex, i) => {
        const color = hexToVec3(hex);
        gradientColors[i].set(color.x, color.y, color.z);
      });
    }

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Vector3(1, 1, 1) },
      animationSpeed: { value: animationSpeed },

      enableTop: { value: enabledWaves.includes('top') },
      enableMiddle: { value: enabledWaves.includes('middle') },
      enableBottom: { value: enabledWaves.includes('bottom') },

      topLineCount: { value: topLineCount },
      middleLineCount: { value: middleLineCount },
      bottomLineCount: { value: bottomLineCount },

      topLineDistance: { value: topLineDistance },
      middleLineDistance: { value: middleLineDistance },
      bottomLineDistance: { value: bottomLineDistance },

      topWavePosition: {
        value: new Vector3(topWavePosition?.x ?? 10.0, topWavePosition?.y ?? 0.5, topWavePosition?.rotate ?? -0.4)
      },
      middleWavePosition: {
        value: new Vector3(
          middleWavePosition?.x ?? 5.0,
          middleWavePosition?.y ?? 0.0,
          middleWavePosition?.rotate ?? 0.2
        )
      },
      bottomWavePosition: {
        value: new Vector3(
          bottomWavePosition?.x ?? 2.0,
          bottomWavePosition?.y ?? -0.7,
          bottomWavePosition?.rotate ?? 0.4
        )
      },

      iMouse: { value: new Vector2(-1000, -1000) },
      interactive: { value: interactive },
      bendRadius: { value: bendRadius },
      bendStrength: { value: bendStrength },
      bendInfluence: { value: 0 },

      parallax: { value: parallax },
      parallaxStrength: { value: parallaxStrength },
      parallaxOffset: { value: new Vector2(0, 0) },

      lineGradient: { value: gradientColors },
      lineGradientCount: { value: linesGradient?.length || 0 }
    };

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms
    });

    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    // Сохраняем ссылки
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    meshRef.current = mesh;
    uniformsRef.current = uniforms;
    startTimeRef.current = performance.now();

    // ResizeObserver с debounce
    let resizeTimeout: number;
    const setSize = () => {
      if (!renderer || !containerRef.current) return;

      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        if (!containerRef.current) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

        console.log(`📏 Window size: ${width}x${height}`);

        if (width > 0 && height > 0) {
          renderer.setSize(width, height);
          uniforms.iResolution.value.set(width, height, 1);
          console.log(`📏 FloatingLines resized: ${width}x${height}`);
        }
      }, 50);
    };

    const ro = new ResizeObserver(setSize);
    ro.observe(containerRef.current);
    setSize(); // Начальный размер

    // Обработчики мыши
    // Таймер для автоматического сброса влияния, если мышь долго не двигается
    let lastMouseMoveTime = Date.now();
    const resetInfluenceTimeout = 1500; // 1.5 секунды без движения

    const handlePointerMove = (event: PointerEvent) => {
      if (!interactive || !renderer) return;

      lastMouseMoveTime = Date.now();

      // Передаем координаты в CSS пикселях (без DPR), как ожидает шейдер
      const rect = renderer.domElement.getBoundingClientRect();

      const x = event.clientX - rect.left;
      const y = rect.height - (event.clientY - rect.top);

      targetMouseRef.current.set(x, y);
      targetInfluenceRef.current = 1.0;

      if (parallax) {
        const parallaxX = (event.clientX / rect.width - 0.5) * 2;
        const parallaxY = (event.clientY / rect.height - 0.5) * 2;
        targetParallaxRef.current.set(parallaxX * parallaxStrength, -parallaxY * parallaxStrength);
      }
    };

    const handlePointerLeave = () => {
      if (!interactive) return;
      console.log('👆 Mouse left canvas');
      targetInfluenceRef.current = 0.0;
    };

    if (interactive) {
      renderer.domElement.addEventListener('pointermove', handlePointerMove);
      renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    }

    // Render loop
    let raf: number;
    const renderLoop = () => {
      if (!renderer || !scene || !camera || !uniforms) return;

      // Обновляем время с сохранением стартового времени
      uniforms.iTime.value = (performance.now() - startTimeRef.current) / 1000;

      // Обновляем мышь
      currentMouseRef.current.lerp(targetMouseRef.current, mouseDamping);
      uniforms.iMouse.value.copy(currentMouseRef.current);

      // Автоматический сброс влияния при отсутствии движения мыши
      const timeSinceLastMove = Date.now() - lastMouseMoveTime;
      if (timeSinceLastMove > resetInfluenceTimeout) {
        targetInfluenceRef.current = 0.0;
      }

      // Обновляем влияние
      currentInfluenceRef.current += (targetInfluenceRef.current - currentInfluenceRef.current) * mouseDamping;
      uniforms.bendInfluence.value = currentInfluenceRef.current;

      // Обновляем параллакс
      if (parallax) {
        currentParallaxRef.current.lerp(targetParallaxRef.current, mouseDamping);
        uniforms.parallaxOffset.value.copy(currentParallaxRef.current);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      console.log('🧹 Cleaning up FloatingLines WebGL scene');
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (interactive) {
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      }
      // НЕ удаляем canvas и renderer - они должны жить постоянно
    };
  }, []); // ПУСТОЙ массив зависимостей - инициализация только один раз!

  // Обновление uniforms при изменении пропсов (только после инициализации)
  useEffect(() => {
    if (uniformsRef.current?.animationSpeed) {
      uniformsRef.current.animationSpeed.value = animationSpeed;
    }
  }, [animationSpeed]);

  useEffect(() => {
    if (uniformsRef.current?.enableTop &&
        uniformsRef.current.enableMiddle &&
        uniformsRef.current.enableBottom) {
      uniformsRef.current.enableTop.value = enabledWaves.includes('top');
      uniformsRef.current.enableMiddle.value = enabledWaves.includes('middle');
      uniformsRef.current.enableBottom.value = enabledWaves.includes('bottom');
    }
  }, [enabledWaves]);

  useEffect(() => {
    if (uniformsRef.current?.topLineCount &&
        uniformsRef.current.middleLineCount &&
        uniformsRef.current.bottomLineCount) {
      uniformsRef.current.topLineCount.value = topLineCount;
      uniformsRef.current.middleLineCount.value = middleLineCount;
      uniformsRef.current.bottomLineCount.value = bottomLineCount;
    }
  }, [topLineCount, middleLineCount, bottomLineCount]);

  useEffect(() => {
    if (uniformsRef.current?.topLineDistance &&
        uniformsRef.current.middleLineDistance &&
        uniformsRef.current.bottomLineDistance) {
      uniformsRef.current.topLineDistance.value = topLineDistance;
      uniformsRef.current.middleLineDistance.value = middleLineDistance;
      uniformsRef.current.bottomLineDistance.value = bottomLineDistance;
    }
  }, [topLineDistance, middleLineDistance, bottomLineDistance]);

  useEffect(() => {
    if (uniformsRef.current?.topWavePosition &&
        uniformsRef.current.middleWavePosition &&
        uniformsRef.current.bottomWavePosition) {
      uniformsRef.current.topWavePosition.value.set(
        topWavePosition?.x ?? 10.0,
        topWavePosition?.y ?? 0.5,
        topWavePosition?.rotate ?? -0.4
      );
      uniformsRef.current.middleWavePosition.value.set(
        middleWavePosition?.x ?? 5.0,
        middleWavePosition?.y ?? 0.0,
        middleWavePosition?.rotate ?? 0.2
      );
      uniformsRef.current.bottomWavePosition.value.set(
        bottomWavePosition?.x ?? 2.0,
        bottomWavePosition?.y ?? -0.7,
        bottomWavePosition?.rotate ?? 0.4
      );
    }
  }, [topWavePosition, middleWavePosition, bottomWavePosition]);

  useEffect(() => {
    if (uniformsRef.current?.interactive &&
        uniformsRef.current.bendRadius &&
        uniformsRef.current.bendStrength) {
      uniformsRef.current.interactive.value = interactive;
      uniformsRef.current.bendRadius.value = bendRadius;
      uniformsRef.current.bendStrength.value = bendStrength;
    }
  }, [interactive, bendRadius, bendStrength]);

  useEffect(() => {
    if (uniformsRef.current?.parallax && uniformsRef.current.parallaxStrength) {
      uniformsRef.current.parallax.value = parallax;
      uniformsRef.current.parallaxStrength.value = parallaxStrength;
    }
  }, [parallax, parallaxStrength]);

  useEffect(() => {
    if (uniformsRef.current?.lineGradient && uniformsRef.current?.lineGradientCount) {
      // Преобразование цветов при обновлении
      const gradientColors = Array.from({ length: 8 }, () => new Vector3(1, 1, 1));

      if (linesGradient && linesGradient.length > 0) {
        const stops = linesGradient.slice(0, 8);
        stops.forEach((hex, i) => {
          const color = hexToVec3(hex);
          gradientColors[i].set(color.x, color.y, color.z);
        });
      }

      uniformsRef.current.lineGradient.value = gradientColors;
      uniformsRef.current.lineGradientCount.value = linesGradient?.length || 0;
    }
  }, [linesGradient]);

  return (
    <div
      ref={containerRef}
      className="floating-lines-container"
      style={{
        mixBlendMode: mixBlendMode as React.CSSProperties['mixBlendMode']
      }}
    />
  );
});

export default FloatingLines;
