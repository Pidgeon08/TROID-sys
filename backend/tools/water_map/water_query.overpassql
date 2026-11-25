[out:json][timeout:90];
(
  way["natural"="water"](16.54,120.26,16.67,120.44);
  relation["natural"="water"](16.54,120.26,16.67,120.44);
  way["waterway"~"^(river|stream|canal|drain|ditch|riverbank)$"](16.54,120.26,16.67,120.44);
  way["natural"="coastline"](16.50,120.22,16.71,120.40);
  way["natural"="wetland"](16.54,120.26,16.67,120.44);
);
out geom;
