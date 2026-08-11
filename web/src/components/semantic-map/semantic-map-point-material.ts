import * as THREE from "three";

/** Instanced shader: WUBRG pie slices on spheres; colorless = hollow outline. */
export function createManaPointMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {},
    vertexShader: `
      attribute float instanceColorMask;
      attribute float instanceDim;
      varying vec3 vLocalPos;
      varying float vMask;
      varying float vDim;

      void main() {
        vLocalPos = normalize(position);
        vMask = instanceColorMask;
        vDim = instanceDim;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vLocalPos;
      varying float vMask;
      varying float vDim;

      vec3 manaColor(int bit) {
        if (bit == 1) return vec3(0.976, 0.976, 0.906);
        if (bit == 2) return vec3(0.090, 0.522, 0.769);
        if (bit == 4) return vec3(0.420, 0.420, 0.420);
        if (bit == 8) return vec3(0.910, 0.204, 0.180);
        if (bit == 16) return vec3(0.020, 0.588, 0.412);
        return vec3(0.8);
      }

      void main() {
        int mask = int(vMask + 0.5);
        float dim = vDim;

        if (mask == 0) {
          float r = length(vLocalPos.xy);
          if (r < 0.42 || r > 0.98) discard;
          gl_FragColor = vec4(0.82 * dim, 0.82 * dim, 0.82 * dim, 0.95);
          return;
        }

        float angle = atan(vLocalPos.y, vLocalPos.x);
        if (angle < 0.0) angle += 6.28318530718;
        angle = mod(angle + 1.57079632679, 6.28318530718);

        int count = 0;
        if ((mask & 1) != 0) count++;
        if ((mask & 2) != 0) count++;
        if ((mask & 4) != 0) count++;
        if ((mask & 8) != 0) count++;
        if ((mask & 16) != 0) count++;

        if (count == 1) {
          if ((mask & 1) != 0) { gl_FragColor = vec4(manaColor(1) * dim, 0.95); return; }
          if ((mask & 2) != 0) { gl_FragColor = vec4(manaColor(2) * dim, 0.95); return; }
          if ((mask & 4) != 0) { gl_FragColor = vec4(manaColor(4) * dim, 0.95); return; }
          if ((mask & 8) != 0) { gl_FragColor = vec4(manaColor(8) * dim, 0.95); return; }
          if ((mask & 16) != 0) { gl_FragColor = vec4(manaColor(16) * dim, 0.95); return; }
        }

        float slice = 6.28318530718 / float(count);
        float edge = 0.0;
        if ((mask & 1) != 0) {
          if (angle >= edge && angle < edge + slice) { gl_FragColor = vec4(manaColor(1) * dim, 0.95); return; }
          edge += slice;
        }
        if ((mask & 2) != 0) {
          if (angle >= edge && angle < edge + slice) { gl_FragColor = vec4(manaColor(2) * dim, 0.95); return; }
          edge += slice;
        }
        if ((mask & 4) != 0) {
          if (angle >= edge && angle < edge + slice) { gl_FragColor = vec4(manaColor(4) * dim, 0.95); return; }
          edge += slice;
        }
        if ((mask & 8) != 0) {
          if (angle >= edge && angle < edge + slice) { gl_FragColor = vec4(manaColor(8) * dim, 0.95); return; }
          edge += slice;
        }
        if ((mask & 16) != 0) {
          if (angle >= edge && angle < edge + slice) { gl_FragColor = vec4(manaColor(16) * dim, 0.95); return; }
        }

        gl_FragColor = vec4(0.5, 0.5, 0.5, 0.95);
      }
    `,
  });
}

export function ensureManaInstanceAttributes(geometry: THREE.BufferGeometry, count: number): {
  colorMask: THREE.InstancedBufferAttribute;
  dim: THREE.InstancedBufferAttribute;
} {
  let colorMask = geometry.getAttribute("instanceColorMask") as THREE.InstancedBufferAttribute | undefined;
  let dim = geometry.getAttribute("instanceDim") as THREE.InstancedBufferAttribute | undefined;

  if (!colorMask || colorMask.count < count) {
    colorMask = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geometry.setAttribute("instanceColorMask", colorMask);
  }
  if (!dim || dim.count < count) {
    dim = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geometry.setAttribute("instanceDim", dim);
  }
  return { colorMask, dim };
}
