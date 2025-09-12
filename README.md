# Stream Command Center

**Notice:** This project is currently under active development. Some features may not be fully implemented or may contain bugs. This repository serves as a preview of the project's progress and future direction.

## About the Project

The Stream Command Center is a web-based, unified dashboard for managing and monitoring a live stream. This application aims to provide streamers with a single panel to track key metrics, manage events, and interact with their community across multiple platforms.

**Key Features (Planned & In Progress):**

* **Real-time Stream Stats:** View live data for viewers, followers, and subscribers.
* **Event Simulation:** Trigger and test on-stream events like new followers, subscribers, donations, and raids.
* **Live Alerts:** A central log for all recent stream events.
* **Unified Live Chat:** A single chat interface to read and respond to messages from platforms like Twitch, YouTube, and Kick.
* **Text-to-Speech (TTS):** A simple tool to convert text messages into spoken audio for on-stream use.
* **Twitch Integration:** Connect your Twitch account to fetch real-time follower data.

---

## Getting Started

Since this is a backend-focused project, you will need to set up a few things to get it running locally.

### Prerequisites

* Node.js (version 18 or higher)
* A PostgreSQL database
* Twitch Developer Account (for API keys)

### Installation

1.  **Clone the Repository**

    ```bash
    git clone [https://github.com/Derek-G1/stream-command-center.git](https://github.com/Derek-G1/stream-command-center.git)
    cd stream-command-center
    ```

2.  **Install Dependencies**

    ```bash
    npm install
    ```

3.  **Set Up Environment Variables**
    Create a `.env` file in the root directory of the project. This file is crucial for securing your sensitive information and is ignored by Git.

    ```
    TWITCH_CLIENT_ID="your_twitch_client_id_here"
    TWITCH_CLIENT_SECRET="your_twitch_client_secret_here"
    DATABASE_URL="your_postgresql_connection_string_here"
    FRONTEND_URL="http://localhost:5500" # Or wherever you are serving the frontend
    PORT=3000
    ```

4.  **Run the Server**

    ```bash
    node server.js
    ```
    The server will start on the port specified in your `.env` file (default is `3000`). It will automatically attempt to initialize the database tables on startup.

5.  **View the Frontend**
    Open `index.html` in your web browser. This file contains the user interface and will connect to your running server.

---

## Project Structure

* `server.js`: The backend application built with Express. It handles API endpoints, database interactions, and Twitch OAuth.
* `script.js`: The frontend JavaScript that manages the UI, fetches data from the backend, and handles user interactions.
* `index.html`: The main HTML file containing the layout for the Stream Command Center dashboard.
* `style.css`: The CSS for styling the dashboard's user interface.
* `package.json` & `package-lock.json`: Manage project dependencies and scripts.

---

## Contribution

This project is a work in progress. We welcome contributions, feature requests, and bug reports. If you'd like to help, please submit a pull request or open an issue on the repository's GitHub page.

---

## License

This project is licensed under the MIT License.