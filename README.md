MCMC Visualizer

An interactive web application that visualizes how various Markov Chain Monte Carlo (MCMC) algorithms explore probability distributions.

Designed for students, data scientists, and researchers to gain intuition about sampling efficiency, tuning parameters, and the behavior of different samplers in 2D space.

(Replace this link with an actual screenshot of your app)

🚀 Features

6 Algorithms Implemented:

Random Walk Metropolis (RWM)

Independent Metropolis-Hastings

Slice Sampling

Elliptical Slice Sampling

Hit-and-Run Sampler

Hamiltonian Monte Carlo (HMC)

4 Target Distributions: Gaussian, Bimodal Mixture, Donut, and Banana (Rosenbrock).

Real-time Visualization: Watch chains evolve step-by-step on a heatmap of the target density.

Interactive Tuning: Adjust step sizes, leapfrog steps, and speed/epsilon on the fly.

Modern UI: Built with a glassmorphism aesthetic using standard CSS.

🛠️ Tech Stack

Framework: Next.js (App Router)

Language: TypeScript

Styling: Pure CSS (CSS-in-JS via styled-jsx)

Icons: Lucide React

Rendering: HTML5 Canvas API (for high-performance particle rendering)

📦 Getting Started

Follow these steps to run the project locally on your machine.

Prerequisites

Node.js (v18 or higher)

npm (comes with Node.js)

Installation

Clone the repository:

git clone [https://github.com/your-username/mcmc-visualizer.git](https://github.com/your-username/mcmc-visualizer.git)
cd mcmc-visualizer


Install dependencies:

npm install


Run the development server:

npm run dev


Open your browser:
Navigate to http://localhost:3000 to see the app.

🎮 How to Use

Select an Algorithm: Use the left sidebar to switch between different samplers.

Choose a Target: Use the dropdown at the top to change the probability distribution (e.g., try "Donut" to see where HMC shines!).

Run: Click the Start button.

Experiment: Use the right-hand panel to tweak parameters like Step Size or Leapfrog Steps while the simulation is running to see the immediate effect on acceptance rates and exploration.

📂 Project Structure

src/app/page.tsx: The entry point of the application.

src/app/MCMCSimulator.tsx: The main component containing all simulation logic, math functions, and UI rendering.

🤝 Contributing

Contributions are welcome! If you want to add a new algorithm (e.g., NUTS, Langevin Dynamics) or a new target density:

Fork the repo.

Create a feature branch.

Submit a Pull Request.

📝 License

This project is open source and available under the MIT License.
