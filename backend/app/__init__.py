from __future__ import annotations

import logging
from pathlib import Path

from flask import Flask, jsonify

from .api.payroll import payroll_api


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    data_directory = Path(__file__).resolve().parent.parent / "data"
    app.config.from_mapping(
        DATA_DIRECTORY=data_directory,
        MAX_CONTENT_LENGTH=25 * 1024 * 1024,
    )
    if test_config:
        app.config.update(test_config)

    Path(app.config["DATA_DIRECTORY"]).mkdir(parents=True, exist_ok=True)
    app.register_blueprint(payroll_api, url_prefix="/api/payroll")

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,OPTIONS"
        return response

    @app.errorhandler(413)
    def file_too_large(_error):
        return jsonify({"message": "Choose a file smaller than 25 MB."}), 413

    @app.errorhandler(Exception)
    def unexpected_error(error):
        app.logger.exception("Unhandled payroll error", exc_info=error)
        return jsonify(
            {"message": "Payroll could not be completed. Check the file and try again."}
        ), 500

    logging.basicConfig(level=logging.INFO)
    return app
