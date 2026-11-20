FROM ros:humble-ros-base

WORKDIR /code

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY ./app ./app

EXPOSE 8002

CMD ["/bin/bash", "-c", "source /opt/ros/humble/setup.bash && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --app-dir /code"]
