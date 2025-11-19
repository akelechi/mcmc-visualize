import Image from "next/image";
import styles from "./page.module.css";
import MCMCSimulator from "./simulator";

export default function Home() {
  return (  
    <main>
      <MCMCSimulator />
    </main>
  );
}
