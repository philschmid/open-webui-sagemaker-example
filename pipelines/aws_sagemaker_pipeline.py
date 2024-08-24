"""
title: AWS Amazon SageMaker Pipeline
author: Philipp Schmid
date: 2024-08-24
version: 1.0
license: MIT
description: A pipeline for generating text and processing images using Amazon SageMaker Endpoints.
requirements: requests, boto3
environment_variables: AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION_NAME, SAGEMAKER_ENDPOINT_NAME
"""

import base64
import json
import logging
from typing import List, Union, Generator, Iterator
import io

import boto3

from pydantic import BaseModel

import os
import requests


# Helper for reading lines from a stream
class LineIterator:
    def __init__(self, stream):
        self.byte_iterator = iter(stream)
        self.buffer = io.BytesIO()
        self.read_pos = 0

    def __iter__(self):
        return self

    def __next__(self):
        while True:
            self.buffer.seek(self.read_pos)
            line = self.buffer.readline()
            if line and line[-1] == ord("\n"):
                self.read_pos += len(line)
                return line[:-1]
            try:
                chunk = next(self.byte_iterator)
            except StopIteration:
                if self.read_pos < self.buffer.getbuffer().nbytes:
                    continue
                raise
            if "PayloadPart" not in chunk:
                print("Unknown event type:" + chunk)
                continue
            self.buffer.seek(0, io.SEEK_END)
            self.buffer.write(chunk["PayloadPart"]["Bytes"])


class Pipeline:
    class Valves(BaseModel):
        AWS_ACCESS_KEY: str = ""
        AWS_SECRET_KEY: str = ""
        AWS_REGION_NAME: str = ""
        SAGEMAKER_ENDPOINT_NAME: str = ""

    def __init__(self):
        self.type = "manifold"
        # Optionally, you can set the id and name of the pipeline.
        # Best practice is to not specify the id so that it can be automatically inferred from the filename, so that users can install multiple versions of the same pipeline.
        # The identifier must be unique across all pipelines.
        # The identifier must be an alphanumeric string that can include underscores or hyphens. It cannot contain spaces, special characters, slashes, or backslashes.
        self.id = "sagemaker_pipeline"
        self.name = "SageMaker: "

        self.valves = self.Valves(
            **{
                "AWS_ACCESS_KEY": os.getenv("AWS_ACCESS_KEY", None),
                "AWS_SECRET_KEY": os.getenv("AWS_SECRET_KEY", None),
                "AWS_REGION_NAME": os.getenv("AWS_REGION_NAME", None),
                "SAGEMAKER_ENDPOINT_NAME": os.getenv("SAGEMAKER_ENDPOINT_NAME", None),
            }
        )

        self.smr = boto3.client(
            "sagemaker-runtime",
            aws_access_key_id=self.valves.AWS_ACCESS_KEY,
            aws_secret_access_key=self.valves.AWS_SECRET_KEY,
            region_name=self.valves.AWS_REGION_NAME,
        )

        self.pipelines = self.get_models()

    async def on_startup(self):
        # This function is called when the server is started.
        print(f"on_startup:{__name__}")
        pass

    async def on_shutdown(self):
        # This function is called when the server is stopped.
        print(f"on_shutdown:{__name__}")
        pass

    async def on_valves_updated(self):
        # This function is called when the valves are updated.
        print(f"on_valves_updated:{__name__}")
        self.smr = boto3.client(
            "sagemaker-runtime",
            aws_access_key_id=self.valves.AWS_ACCESS_KEY,
            aws_secret_access_key=self.valves.AWS_SECRET_KEY,
            region_name=self.valves.AWS_REGION_NAME,
        )

        self.pipelines = self.get_models()

    def pipelines(self) -> List[dict]:
        return self.get_models()

    def get_models(self):
        if self.valves.SAGEMAKER_ENDPOINT_NAME:
            return [
                {
                    "id": self.valves.SAGEMAKER_ENDPOINT_NAME,
                    "name": self.valves.SAGEMAKER_ENDPOINT_NAME,
                }
            ]
        else:
            return []

    def pipe(
        self, user_message: str, model_id: str, messages: List[dict], body: dict
    ) -> Union[str, Generator, Iterator]:
        # This is where you can add your custom pipelines like RAG.
        logging.info(f"pipe:{__name__}")
        logging.info(f"body:{body}")
        print(body)
        try:
            payload = {
                "model": self.valves.SAGEMAKER_ENDPOINT_NAME,
                "messages": messages,
                "stream": body.get("stream", False),
                "top_p": body.get("top_p", 0.9),
                "temperature": body.get("temperature", 0.5),
                "max_tokens": body.get("max_tokens", 1024),
            }
            if payload["stream"]:
                return self.stream_response(model_id, payload)
            else:
                return self.get_completion(model_id, payload)
        except Exception as e:
            return f"Error: {e}"

    def stream_response(self, endpoint_name: str, payload: dict) -> Generator:
        resp = self.smr.invoke_endpoint_with_response_stream(
            EndpointName=endpoint_name,
            Body=json.dumps(payload),
            ContentType="application/json",
        )

        output = ""
        for c in LineIterator(resp["Body"]):
            c = c.decode("utf-8")
            if c.startswith("data:"):
                chunk = json.loads(c.lstrip("data:").rstrip("/n"))
                if chunk["choices"][0]["finish_reason"]:
                    break
                yield chunk["choices"][0]["delta"]["content"]
        return output

    def get_completion(self, model_id: str, payload: dict) -> str:
        resp = self.smr.invoke_endpoint(
            EndpointName=model_id,
            Body=json.dumps(payload),
            ContentType="application/json",
        )
        return resp["Body"].read().decode("utf-8")
