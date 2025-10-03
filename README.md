# Router-Algo / Trip Planner

An interactive web-based application designed to help users plan optimized travel routes across multiple destinations. It incorporates real-time weather insights and geospatial mapping to provide a seamless and informed travel planning experience. The core focus of the application is on South India and parts of Sri Lanka.

---

## Table of Contents

- [Features](#features)  
- [Tech Stack](#tech-stack)  
- [Installation](#installation)  
- [Usage](#usage)
- [Screenshots](#screenshots)    
- [Configuration](#configuration)  

---

## Features

- Plan routes covering multiple destinations  
- Automatically compute optimal routes (shortest distance / time)  
- Display route map and directions visually  
- Show real-time weather conditions at each stop on the route  
- Focus on regions: South India & parts of Sri Lanka  

---

## Tech Stack

| Component | Technology / Framework |
|-----------|-------------------------|
| Frontend | TypeScript, JavaScript, HTML, CSS |
| Backend / API | (if any – describe here, e.g. Node.js, Python / FastAPI, etc.) |
| Mapping / Geospatial Services | Map API (could be Google Maps, Leaflet, Mapbox, etc.) |
| Weather API | (e.g. OpenWeatherMap, WeatherAPI, etc.) |

---

## Installation

To run the project locally, follow these steps:

1. Clone the repository  
   bash
   git clone https://github.com/venkatesudondla/-Router-Algorithm
2. Navigate into the project directory
   bash
   cd Router-Algo

3. Install frontend dependencies
   bash
   cd trip-planner-app   # or the folder containing the frontend
   npm install


4. Install backend dependencies (if any)
   bash
   cd ../backend         # or the appropriate backend folder
   # For Node.js
   npm install
   # For Python
   pip install -r requirements.txt

 ## Usage

After setting up:

1. Start the backend server
    bash
    # Node.js
   npm start
   # Python / FastAPI
   uvicorn main:app --reload


2. Start the frontend server
   bash
   cd trip-planner-app
   npm start


3. Open your browser and go to:
    bash
   http://localhost:3000


(or whatever port the frontend uses)
## Screenshots
<img width="1919" height="952" alt="image" src="https://github.com/user-attachments/assets/bee809fb-2dd0-4168-8be9-0c3834a34b6c" />
<img width="1919" height="953" alt="image" src="https://github.com/user-attachments/assets/e8355326-1964-4ac1-a5ee-8a41ac8ddea8" />

## Configuration
   

You may need API keys for mapping and weather services.


- Create a .env file at the root (or frontend/backend folder) and define variables like:
- Modify region settings if you wish to extend beyond South India / Sri Lanka.
   bash
   MAP_API_KEY=your_map_key_here
   WEATHER_API_KEY=your_weather_key_here
