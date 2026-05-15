import hashlib
import struct
import math


class EmbeddingService:
    """
    Generates simple text embeddings using TF-IDF-like approach.
    Produces 768-dimensional vectors for pgvector compatibility.
    """

    EMBEDDING_DIM = 768

    def generate_embedding(self, text: str) -> list[float]:
        """Generate a 768-dim embedding vector from text."""
        words = text.lower().split()
        if not words:
            return [0.0] * self.EMBEDDING_DIM

        word_freq: dict[str, int] = {}
        for word in words:
            clean = "".join(c for c in word if c.isalnum())
            if clean and len(clean) > 1:
                word_freq[clean] = word_freq.get(clean, 0) + 1

        embedding = [0.0] * self.EMBEDDING_DIM
        total_words = len(words)

        for word, freq in word_freq.items():
            word_hash = hashlib.sha256(word.encode()).digest()
            tf = freq / total_words

            for i in range(0, min(len(word_hash), 32), 4):
                dim_idx = struct.unpack("I", word_hash[i : i + 4])[0] % self.EMBEDDING_DIM
                raw = struct.unpack("f", word_hash[i : i + 4])[0]

                # struct.unpack("f",...) can produce NaN or Inf from certain
                # bit patterns in the SHA-256 digest. Guard before any arithmetic.
                if not math.isfinite(raw):
                    raw = 0.0

                norm_value = (raw % 2.0 - 1.0) * tf
                embedding[dim_idx] += norm_value

        # L2 normalize
        magnitude = math.sqrt(sum(v * v for v in embedding))
        if magnitude > 0:
            embedding = [v / magnitude for v in embedding]

        # Final safety pass — replace any residual NaN/Inf with 0.0
        # (can happen if magnitude underflows on all-zero vectors)
        embedding = [v if math.isfinite(v) else 0.0 for v in embedding]

        return embedding
