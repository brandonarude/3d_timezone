import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import ThreeGlobe from "three-globe";
//import { find } from "geo-tz";
//import SunCalc from 'suncalc';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Camera setup
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 300;

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// OrbitControls setup
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false; // Disable panning, only rotation allowed
controls.minDistance = 150; // Minimum zoom distance
controls.maxDistance = 900; // Maximum zoom distance (300% of default)
controls.target.set(0, 0, 0); // Always centered on Earth

// Create custom material for stylized purple Earth
const textureLoader = new THREE.TextureLoader();
const earthTexture = textureLoader.load('//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png');

// Custom shader material for illumination-based gradient
const globeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    earthTexture: { value: earthTexture },
    sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    oceanColor: { value: new THREE.Color(0x0f0018) },
    landColorDark: { value: new THREE.Color(0x1f014d) },
    landColorLight: { value: new THREE.Color(0x6803FF) }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D earthTexture;
    uniform vec3 sunDirection;
    uniform vec3 oceanColor;
    uniform vec3 landColorDark;
    uniform vec3 landColorLight;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    
    void main() {
      // Sample texture to determine land vs ocean
      vec4 texColor = texture2D(earthTexture, vUv);
      float isLand = step(0.1, texColor.r); // Simple threshold for land
      
      // Calculate illumination
      vec3 normal = normalize(vNormal);
      float illumination = max(dot(normal, normalize(sunDirection)), 0.0);
      
      // Interpolate land color based on illumination
      vec3 landColor = mix(landColorDark, landColorLight, illumination * 0.8 + 0.2);
      
      // Choose between ocean and land color
      vec3 finalColor = mix(oceanColor, landColor, isLand);
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
});

// Globe setup
const globeGeometry = new THREE.SphereGeometry(100, 64, 64);
const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
scene.add(globeMesh);

// Use three-globe for atmosphere effect
const globe = new ThreeGlobe({ animateIn: false })
  .showGlobe(false)
  .showAtmosphere(true)
  .atmosphereColor('#6803FF')
  .atmosphereAltitude(0.15);

scene.add(globe);

// Ambient light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

// Sun directional light (will be updated with solar position)
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(1, 0, 0);
scene.add(sunLight);

// Variables for interaction
let currentPin: THREE.Mesh | null = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Update sun position based on current time
/*function updateSunPosition() {
  const now = new Date();
  const sunPos = SunCalc(now);
  
  // Convert solar azimuth and altitude to 3D position
  const distance = 500;
  const altitude = sunPos.altitude * (Math.PI / 180);
  const azimuth = sunPos.azimuth * (Math.PI / 180);
  
  const x = distance * Math.cos(altitude) * Math.sin(azimuth);
  const y = distance * Math.sin(altitude);
  const z = distance * Math.cos(altitude) * Math.cos(azimuth);
  
  sunLight.position.set(x, y, z);
  sunLight.lookAt(0, 0, 0);
  
  // Update shader uniform
  const sunDir = new THREE.Vector3(x, y, z).normalize();
  globeMaterial.uniforms.sunDirection.value = sunDir;
}*/

// Update Earth rotation based on time
function updateEarthRotation() {
  const now = new Date();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  
  // Calculate rotation based on time (Earth rotates 360° in 24 hours)
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const rotationAngle = (totalSeconds / 86400) * Math.PI * 2;
  
  globeMesh.rotation.y = -rotationAngle;
}

// Handle window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

// Handle mouse click
function onMouseClick(event: MouseEvent) {
  // Calculate mouse position in normalized device coordinates
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  // Update raycaster
  raycaster.setFromCamera(mouse, camera);
  
  // Check for intersection with globe mesh
  const intersects = raycaster.intersectObject(globeMesh, true);
  
  if (intersects.length > 0) {
    const point = intersects[0].point;
    
    // Convert 3D point to lat/lng
    const lat = 90 - (Math.acos(point.y / point.length()) * 180) / Math.PI;
    const lng = ((270 + (Math.atan2(point.x, point.z) * 180) / Math.PI) % 360) - 180;
    
    // Display timezone and time
    displayTimeAtLocation(lat, lng, point);
    
    // Place pin
    placePin(point);
  }
}

window.addEventListener('click', onMouseClick);

// Display time at clicked location
/*function displayTimeAtLocation(lat: number, lng: number, point: THREE.Vector3) {
  try {
    // Get timezone for coordinates
    const timezones = find(lat, lng);
    const timezone = timezones[0] || 'UTC';
    
    // Get current time in that timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
    
    const timeString = formatter.format(now);
    
    // Create or update popup
    showPopup(timeString, lat.toFixed(2), lng.toFixed(2), timezone);
  } catch (error) {
    console.error('Error getting timezone:', error);
    showPopup('Unknown', lat.toFixed(2), lng.toFixed(2), 'Unknown timezone');
  }
}*/

// Show popup with time information
function showPopup(time: string, lat: string, lng: string, timezone: string) {
  let popup = document.getElementById('time-popup');
  
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'time-popup';
    document.body.appendChild(popup);
    
    // Add click handler for close button
    popup.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'time-popup' || 
          (e.target as HTMLElement).classList.contains('close-btn')) {
        popup!.style.display = 'none';
      }
    });
  }
  
  popup.innerHTML = `
    <div class="popup-content">
      <span class="close-btn">×</span>
      <h3>Local Time</h3>
      <p class="time">${time}</p>
      <p class="coords">Lat: ${lat}°, Lng: ${lng}°</p>
      <p class="timezone">${timezone}</p>
    </div>
  `;
  
  popup.style.display = 'block';
}

// Place a pin at the clicked location
function placePin(point: THREE.Vector3) {
  // Remove existing pin with fade
  if (currentPin) {
    const fadingPin = currentPin;
    let opacity = 1;
    const fadeInterval = setInterval(() => {
      opacity -= 0.05;
      if (opacity <= 0) {
        scene.remove(fadingPin);
        clearInterval(fadeInterval);
      } else {
        (fadingPin.material as THREE.MeshStandardMaterial).opacity = opacity;
      }
    }, 20);
  }
  
  // Create new pin
  const pinGeometry = new THREE.SphereGeometry(2, 16, 16);
  const pinMaterial = new THREE.MeshStandardMaterial({
    color: 0xff00ff,
    emissive: 0xff00ff,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 1
  });
  
  const pin = new THREE.Mesh(pinGeometry, pinMaterial);
  
  // Position pin slightly above surface
  const normal = point.clone().normalize();
  pin.position.copy(normal.multiplyScalar(point.length() + 5));
  
  scene.add(pin);
  currentPin = pin;
}

// Fetch and display ISS position
async function updateISSPosition() {
  try {
    const response = await fetch('http://api.open-notify.org/iss-now.json');
    const data = await response.json();
    
    const lat = parseFloat(data.iss_position.latitude);
    const lng = parseFloat(data.iss_position.longitude);
    
    // Convert lat/lng to 3D position
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    
    const radius = 100 + 15; // Earth radius + ISS altitude offset
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    
    // Create or update ISS marker
    let issMarker = scene.getObjectByName('iss-marker') as THREE.Mesh;
    
    if (!issMarker) {
      const issGeometry = new THREE.SphereGeometry(3, 16, 16);
      const issMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 0.8
      });
      issMarker = new THREE.Mesh(issGeometry, issMaterial);
      issMarker.name = 'iss-marker';
      scene.add(issMarker);
    }
    
    issMarker.position.set(x, y, z);
  } catch (error) {
    console.error('Error fetching ISS position:', error);
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  controls.update();
  renderer.render(scene, camera);
}

// Initialize
//updateSunPosition();
updateEarthRotation();
updateISSPosition();

// Update sun position and Earth rotation every minute
setInterval(() => {
  //updateSunPosition();
  updateEarthRotation();
}, 60000);

// Update ISS position every 5 seconds
setInterval(updateISSPosition, 5000);

animate();