from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    BigInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import declarative_base, relationship

from shared.time_utils import utcnow

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False)
    public_id = Column(String(4), unique=True, index=True)
    username = Column(String)
    first_name = Column(String)
    last_name = Column(String)
    email = Column(String)
    role = Column(String, nullable=False)
    status = Column(String, default="inactive")
    wallet_balance = Column(Float, default=0.0)
    disclaimer_accepted_at = Column(DateTime)
    disclaimer_version = Column(String)
    created_at = Column(DateTime, default=utcnow)

    model_profile = relationship("ModelProfile", back_populates="user", uselist=False)
    client_profile = relationship("ClientProfile", back_populates="user", uselist=False)


class ModelProfile(Base):
    __tablename__ = "model_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    display_name = Column(String)
    verification_status = Column(String, default="pending")
    verification_submitted_at = Column(DateTime)
    approved_at = Column(DateTime)
    approved_by = Column(Integer)
    verification_photos = Column(ARRAY(Text))
    verification_video_file_id = Column(String)
    verification_video_url = Column(String)
    verification_video_path = Column(String)
    is_online = Column(Boolean, default=False)
    last_seen_at = Column(DateTime)
    total_earnings = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="model_profile")


class ClientProfile(Base):
    __tablename__ = "client_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    total_spent = Column(Float, default=0.0)
    access_fee_paid = Column(Boolean, default=False)
    access_fee_escrow_id = Column(Integer, ForeignKey("escrow_accounts.id"))
    access_granted_at = Column(DateTime)

    user = relationship("User", back_populates="client_profile")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    session_ref = Column(String, unique=True, nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    model_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_type = Column(String)
    package_price = Column(Float)
    status = Column(String, default="pending")
    client_confirmed = Column(Boolean, default=False)
    model_confirmed = Column(Boolean, default=False)
    duration_minutes = Column(Integer)
    started_at = Column(DateTime)
    ended_at = Column(DateTime)
    actual_start = Column(DateTime)
    scheduled_end = Column(DateTime)
    completed_at = Column(DateTime)
    escrow_id = Column(Integer, ForeignKey("escrow_accounts.id"))
    created_at = Column(DateTime, default=utcnow)


class DigitalContent(Base):
    __tablename__ = "digital_content"

    id = Column(Integer, primary_key=True)
    model_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content_type = Column(String)
    title = Column(String)
    description = Column(Text)
    price = Column(Float)
    telegram_file_id = Column(String)
    preview_file_id = Column(String)
    is_active = Column(Boolean, default=False)
    total_sales = Column(Integer, default=0)
    total_revenue = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow)


class ContentPurchase(Base):
    __tablename__ = "content_purchases"

    id = Column(Integer, primary_key=True)
    content_id = Column(Integer, ForeignKey("digital_content.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    transaction_id = Column(Integer)
    price_paid = Column(Float)
    escrow_id = Column(Integer, ForeignKey("escrow_accounts.id"))
    status = Column(String, default="pending")
    purchased_at = Column(DateTime, default=utcnow)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    transaction_ref = Column(String, unique=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    transaction_type = Column(String)
    amount = Column(Float)
    payment_provider = Column(String)
    status = Column(String)
    metadata_json = Column(JSONB)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow)


class EscrowAccount(Base):
    __tablename__ = "escrow_accounts"

    id = Column(Integer, primary_key=True)
    escrow_ref = Column(String, unique=True, nullable=False)
    escrow_type = Column(String, nullable=False)
    related_id = Column(Integer)
    payer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Float, nullable=False)
    platform_fee = Column(Float, nullable=False)
    receiver_payout = Column(Float)
    status = Column(String, default="held")
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    held_at = Column(DateTime, default=utcnow)
    released_at = Column(DateTime)
    auto_release_at = Column(DateTime)
    release_condition = Column(String)
    release_condition_met = Column(Boolean, default=False)
    dispute_reason = Column(Text)

Index("idx_escrow_type", EscrowAccount.escrow_type)
Index("idx_escrow_status", EscrowAccount.status)
Index("idx_escrow_related", EscrowAccount.escrow_type, EscrowAccount.related_id)
Index("idx_escrow_auto_release", EscrowAccount.auto_release_at, EscrowAccount.status)

class AdminAction(Base):
    __tablename__ = "admin_actions"

    id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action_type = Column(String)
    target_user_id = Column(Integer, ForeignKey("users.id"))
    target_type = Column(String)
    target_id = Column(Integer)
    details = Column(JSONB)
    created_at = Column(DateTime, default=utcnow)
