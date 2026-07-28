import { Link } from "react-router";
import rainflixLogo from "../../assets/rainflix-r.png";

export default function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 border-t border-blue-950/70 px-5 py-8 text-sm text-slate-500 md:px-10 lg:px-12">
      <Link
        className="inline-flex items-center gap-2 font-bold text-slate-100 transition hover:text-sky-300 focus-visible:text-sky-300 focus-visible:outline-none"
        to="/home"
        aria-label="RainFlix home"
      >
        <img className="h-6 w-6 object-contain" src={rainflixLogo} alt="" />
        <span>RainFlix</span>
      </Link>

      <a
        className="text-right transition hover:text-sky-300 focus-visible:text-sky-300 focus-visible:outline-none"
        href="mailto:rainermayagma9@gmail.com"
      >
        Contact Support
      </a>
    </footer>
  );
}
