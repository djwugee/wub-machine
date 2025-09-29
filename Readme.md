# The Wub Machine

The Wub Machine is a web and console application that automatically remixes music into various electronic styles like Dubstep and Electro-House.

This project is a fork of the original Wub Machine, updated to use modern Python libraries and a simplified setup process.

*   [Prerequisites](#prerequisites)
*   [Setup](#setup)
*   [Running the Remixer](#running-the-remixer)
*   [Running the Web Frontend](#running-the-web-frontend)
*   [Configuration](#configuration)
*   [System Requirements](#system-requirements)

## <a name='prerequisites'></a>Prerequisites

The Wub Machine is tested on macOS and Ubuntu, but it should work on any system where the dependencies can be installed.

### System Dependencies

You will need to install the following tools using your system's package manager.

**For Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install python3-dev python3-pip ffmpeg lame soundstretch shntool
```

**For macOS (using [Homebrew](https://brew.sh/)):**
```bash
brew install python ffmpeg lame soundstretch shntool
```

## <a name='setup'></a>Setup

Follow these steps to get your local instance of The Wub Machine running.

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/wub-machine.git
cd wub-machine
```

### 2. Create a Python Virtual Environment

It is highly recommended to use a virtual environment to manage project dependencies.

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python Dependencies

Install all the required Python packages using `pip`.

```bash
pip install -r requirements.txt
```

### 4. Set Up the Database

The Wub Machine uses a MySQL database to store track information and event logs.

1.  **Log in to MySQL:**
    ```bash
    mysql -u root -p
    ```

2.  **Create a new database and user:**
    ```sql
    CREATE DATABASE wubmachine;
    CREATE USER 'wubuser'@'localhost' IDENTIFIED BY 'wubpassword';
    GRANT ALL PRIVILEGES ON wubmachine.* TO 'wubuser'@'localhost';
    FLUSH PRIVILEGES;
    EXIT;
    ```
    *Note: Replace `'wubpassword'` with a secure password of your choice.*

### 5. Configure the Application

1.  **Create a `config.yml` file** by copying the example file:
    ```bash
    cp config.yml.example config.yml
    ```

2.  **Edit `config.yml`** with your database connection details. Update the `database_connect_string` to match the user, password, and database name you created in the previous step.
    ```yaml
    # config.yml
    database_connect_string: 'mysql+pymysql://wubuser:wubpassword@localhost/wubmachine'
    ```

### 6. Create Required Directories

The application needs several directories to store uploads, remixes, and artwork.

```bash
mkdir -p uploads static/songs static/art static/thumbnails
```

## <a name='running-the-remixer'></a>Running the Remixer

You can remix a track directly from the command line. The output file will be saved in the same directory as the original.

**Dubstep:**
```bash
python -m remixers.dubstep <path/to/your/song.mp3>
```

**Electro-House:**
```bash
python -m remixers.electrohouse <path/to/your/song.mp3>
```

## <a name='running-the-web-frontend'></a>Running the Web Frontend

To start the web interface, run the `server.py` script:

```bash
python server.py
```

The server will start, and you can access the application in your web browser at `http://localhost:8001` (or the port specified in your `config.yml`).

## <a name='configuration'></a>Configuration

The application's behavior is controlled by the `config.yml` file. Here are some of the key settings:

*   `app_name`: The public name of your application.
*   `maximum_concurrent_remixes`: The number of remixes to process simultaneously. Set this to the number of CPU cores on your machine for best performance.
*   `maximum_waiting_remixes`: The number of tracks allowed to be in the queue.
*   `database_connect_string`: The connection string for your MySQL database.
*   `socket_io_port`: The port for the web server to listen on.

## <a name='system-requirements'></a>System Requirements

Remixing music can be resource-intensive. To remix a song that is **X** MB in size and **Y** minutes long, expect:

*   **Memory Usage:** ~60MB * **Y**
*   **Temporary Disk Space:** ~60MB * **Y**
*   **Network Bandwidth:** Up to **X** MB for the initial upload.

For example, a 2-minute, 4MB song will use about 120MB of memory and 100MB of temporary disk space during processing.