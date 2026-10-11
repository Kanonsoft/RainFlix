import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Layers, MonitorPlay, Bookmark } from "lucide-react";
import * as THREE from "three";
import wordmark from "../../assets/rainflix-wordmark.png";
import { usePageMetadata } from "../lib/metadata.js";
import { api } from "../lib/api.js";
import "./landing.css";

const desktop = `${import.meta.env.BASE_URL}screenshots/home-desktop.png`;
const mobile = `${import.meta.env.BASE_URL}screenshots/browse-mobile.png`;

function Showcase() {
  const host = useRef(null);
  useEffect(() => {
    const element = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 12;
    const group = new THREE.Group();
    scene.add(group);
    const textures = [];
    const meshes = [];
    let disposed = false;
    function screen(url, w, h, x, y, z, angle) {
      const geometry = new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.16);
      const frame = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0x24303a }),
      );
      frame.position.set(x, y, z);
      frame.rotation.set(-0.06, angle, -0.055);
      group.add(frame);
      meshes.push(frame);
      new THREE.TextureLoader().load(url, (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        textures.push(texture);
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ map: texture }),
        );
        panel.position.z = 0.09;
        frame.add(panel);
        meshes.push(panel);
      });
    }
    screen(desktop, 7.2, 4.5, 2, -0.25, 0, -0.22);
    screen(mobile, 1.65, 3.57, 4.7, -1.2, 1, -0.12);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const compact = width < 768;
      group.scale.setScalar(compact ? 0.7 : 1);
      group.position.set(compact ? -1.45 : 0, compact ? -1.8 : 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let pointer = 0;
    const move = (event) => {
      pointer = (event.clientX / window.innerWidth - 0.5) * 0.08;
    };
    window.addEventListener("pointermove", move);
    let frame;
    const draw = (time) => {
      if (!motion.matches) {
        group.rotation.y += (pointer - group.rotation.y) * 0.04;
        group.rotation.z = Math.sin(time / 5000) * 0.008;
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className="landing-scene" ref={host} aria-hidden="true">
      <img className="landing-fallback" src={desktop} alt="" />
    </div>
  );
}

export default function LandingPage() {
  const [backdrop, setBackdrop] = useState("");
  useEffect(() => {
    let cancelled = false;
    api
      .getTrendingMovies(1)
      .then(async (feed) => {
        const url = feed.items?.[0]?.backdrop || feed.items?.[0]?.poster;
        if (!url) return;
        const image = new Image();
        image.src = url;
        await image.decode().catch(() => {});
        if (!cancelled) setBackdrop(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  usePageMetadata({
    title: "RainFlix",
    description:
      "Your next watch, all in one place. Explore films and series with RainFlix.",
  });
  return (
    <div className="landing">
      <nav className="landing-nav" aria-label="RainFlix introduction">
        <Link to="/" aria-label="RainFlix">
          <img src={wordmark} alt="RainFlix" />
        </Link>
        <Link to="/downloads">Downloads</Link>
      </nav>
      <section className="landing-hero">
        {backdrop && (
          <img className="landing-movie-backdrop" src={backdrop} alt="" />
        )}
        <Showcase />
        <div className="landing-copy">
          <p className="landing-eyebrow">YOUR NEXT WATCH STARTS HERE</p>
          <h1>RainFlix</h1>
          <p className="landing-description">
            A home for your movies, series, and everything you want to watch
            next.
          </p>
          <div className="landing-actions">
            <Link className="landing-download" to="/downloads">
              Download RainFlix
            </Link>
            <Link className="landing-open" to="/home">
              Open RainFlix on web
            </Link>
          </div>
          <p className="landing-platforms">
            Windows & Android apps. A catalog on the web.
          </p>
        </div>
      </section>
      <section className="landing-features">
        <div>
          <span className="landing-eyebrow">ONE PLACE. YOUR WAY.</span>
          <h2>
            Less searching.
            <br />
            More discovering.
          </h2>
        </div>
        <div className="landing-feature">
          <Layers />
          <h3>Find your next favorite</h3>
          <p>
            Browse movies and series by genre and year, explore cast credits,
            and discover related titles.
          </p>
        </div>
        <div className="landing-feature">
          <MonitorPlay />
          <h3>Make it yours</h3>
          <p>
            Native playback, subtitles, and optional add-ons in the desktop and
            Android apps.
          </p>
        </div>
        <div className="landing-feature">
          <Bookmark />
          <h3>Pick up where you left off</h3>
          <p>
            Keep a watchlist and return to your viewing progress on your device.
          </p>
        </div>
      </section>
      <section className="landing-bottom">
        <h2>
          A little less scrolling.
          <br />A little more watching.
        </h2>
        <Link className="landing-download" to="/downloads">
          Get RainFlix
        </Link>
        <p>
          Availability depends on your region and the services or add-ons you
          use.
        </p>
      </section>
    </div>
  );
}
