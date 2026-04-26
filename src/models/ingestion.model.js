const mongoose = require("mongoose");

const ingestionSchema = new mongoose.Schema(
  {
    file_hash: { type: String, required: true, unique: true },
    source_file: { type: String, required: true },

    status: {
      type: String,
      enum: ["processing", "staged", "prod", "failed"],
      default: "processing",
    },

    last_processed_page: { type: Number, default: 0 },
    total_pages: { type: Number },
    qdrant_collection: { type: String },
    last_error: { type: String },
  },
  { timestamps: { createdAt: "started_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Ingestion", ingestionSchema);