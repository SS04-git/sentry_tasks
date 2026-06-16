from sqlalchemy import Column, Integer, String, BigInteger, Text
from app.db.database import Base


class GitHubAccount(Base):
    __tablename__ = "github_accounts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=True)

    github_id = Column(BigInteger, unique=True)
    github_login = Column(String(255))

    access_token = Column(Text)