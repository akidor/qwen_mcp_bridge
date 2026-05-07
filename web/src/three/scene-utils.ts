import * as THREE from "three";

import type { Coord2D, Coord3D, SceneData } from "./scene-types";

export function coord2DToVector3([x, y]: Coord2D, height = 0) {
  return new THREE.Vector3(x, height, -y);
}

export function coord3DToVector3([x, y, z]: Coord3D) {
  return new THREE.Vector3(x, z, -y);
}

export function createShape(coordinates: Coord2D[], holes: Coord2D[][] = []) {
  const shape = new THREE.Shape();
  coordinates.forEach(([x, y], index) => {
    if (index === 0) {
      shape.moveTo(x, y);
      return;
    }

    shape.lineTo(x, y);
  });
  shape.closePath();

  holes.forEach((holeCoords) => {
    const hole = new THREE.Path();
    holeCoords.forEach(([x, y], index) => {
      if (index === 0) {
        hole.moveTo(x, y);
        return;
      }
      hole.lineTo(x, y);
    });
    hole.closePath();
    shape.holes.push(hole);
  });

  return shape;
}

export function polygonBounds(coordinates: Coord2D[]) {
  return coordinates.reduce(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

export function getSceneBounds(sceneData: SceneData) {
  const siteBounds = polygonBounds(sceneData.site.coordinates);
  const allCoords: Coord2D[] = [
    ...sceneData.site.coordinates,
    ...sceneData.neighbors.flatMap((neighbor) => neighbor.coordinates),
    ...sceneData.nearby_buildings.flatMap((building) => building.footprints.flat()),
  ];
  const combinedBounds = allCoords.length > 0 ? polygonBounds(allCoords) : siteBounds;

  // WMS 타일은 terrain grid 범위와 일치해야
  if (sceneData.terrain && sceneData.terrain.points.length > 0) {
    const tp = sceneData.terrain.points;
    const cols = sceneData.terrain.cols;
    const minX = tp[0][0];
    const minY = tp[0][1];
    const maxX = tp[tp.length - 1][0];
    const maxY = tp[tp.length - 1][1];
    const spanX = maxX - minX;
    const spanY = maxY - minY;

    return {
      minX, maxX, minY, maxY,
      size: Math.max(spanX, spanY, 1),
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
      },
      // site 중심 (카메라 타겟용)
      siteCenter: {
        x: (combinedBounds.minX + combinedBounds.maxX) / 2,
        y: (combinedBounds.minY + combinedBounds.maxY) / 2,
      },
    };
  }

  const spanX = combinedBounds.maxX - combinedBounds.minX;
  const spanY = combinedBounds.maxY - combinedBounds.minY;

  return {
    ...combinedBounds,
    size: Math.max(spanX, spanY, 1),
    center: {
      x: (combinedBounds.minX + combinedBounds.maxX) / 2,
      y: (combinedBounds.minY + combinedBounds.maxY) / 2,
    },
    siteCenter: {
      x: (siteBounds.minX + siteBounds.maxX) / 2,
      y: (siteBounds.minY + siteBounds.maxY) / 2,
    },
  };
}

export function proxifyGeoserverUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const geoserverIndex = parsed.pathname.indexOf("/geoserver/");

    if (geoserverIndex === -1) {
      return url;
    }

    return `${parsed.pathname.slice(geoserverIndex)}${parsed.search}`;
  } catch {
    return url;
  }
}
