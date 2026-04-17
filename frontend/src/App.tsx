import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Ticker from "./components/Ticker";
import HowItWorks from "./components/HowItWorks";
import Architecture from "./components/Architecture";
import Demo from "./components/Demo";
import WhyProva from "./components/WhyProva";
import BusinessModel from "./components/BusinessModel";
import CTA from "./components/CTA";
import Footer from "./components/Footer";

export default function App() {
  return (
    <div className="bg-black min-h-screen">
      <Navbar />
      <Hero />
      <Ticker />
      <HowItWorks />
      <Architecture />
      <Demo />
      <WhyProva />
      <BusinessModel />
      <CTA />
      <Footer />
    </div>
  );
}
