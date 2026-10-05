from pydantic import BaseModel, ConfigDict


class ResponseModel(BaseModel):
    """API が返す形の基底。

    応答は既定値の欄も必ず含むので、OpenAPI でも必須として出す。こうしないと、
    フロントが OpenAPI から作る型で `average_score?: number | null` のように任意の欄になる。
    """

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_serialization_defaults_required=True,
    )
