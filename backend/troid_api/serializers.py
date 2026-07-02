import random
import string

from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework import serializers

from .models import Barangay, Boat, CleanupRequest, DetectionEvent, Operator, ScheduledBot, ScheduledCleanup, User


class DetectionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetectionEvent
        fields = ['id', 'boat', 'timestamp', 'latitude', 'longitude', 'trash_count']


class UserSerializer(serializers.ModelSerializer):
    is_signed_in = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'user_id', 'username', 'email', 'role',
            'full_name', 'is_active', 'created_at', 'last_login', 'is_signed_in',
        ]

    def get_is_signed_in(self, obj):
        if not obj.last_login:
            return False
        now = timezone.now()
        diff = (now - obj.last_login).total_seconds()
        return diff < 300


class CreateUserSerializer(serializers.ModelSerializer):
    """Serializer for creating a new user — hashes password and generates user_id."""

    password = serializers.CharField(write_only=True, min_length=6)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'role', 'full_name', 'password', 'confirm_password']

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        password = validated_data.pop('password')

        while True:
            uid = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            if not User.objects.filter(user_id=uid).exists():
                break

        user = User.objects.create(
            user_id=uid,
            password_hash=make_password(password),
            **validated_data,
        )
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class BarangaySerializer(serializers.ModelSerializer):
    spearhead_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Barangay
        fields = ['barangay_id', 'barangay_name', 'latitude', 'longitude', 'spearhead_id', 'created_at']


class OperatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Operator
        fields = ['id', 'name', 'status', 'availability']


class BoatSerializer(serializers.ModelSerializer):
    operator = OperatorSerializer(read_only=True)

    class Meta:
        model = Boat
        fields = ['id', 'name', 'is_active', 'last_latitude', 'last_longitude', 'battery_level', 'last_seen', 'operator']


class CleanupRequestSerializer(serializers.ModelSerializer):
    spearhead_username = serializers.CharField(source='spearhead.username', read_only=True)
    spearhead_full_name = serializers.CharField(source='spearhead.full_name', read_only=True)
    barangay_name = serializers.CharField(source='barangay.barangay_name', read_only=True)
    media_url = serializers.SerializerMethodField()

    class Meta:
        model = CleanupRequest
        fields = [
            'request_id', 'spearhead', 'spearhead_username', 'spearhead_full_name',
            'barangay', 'barangay_name', 'description', 'media_type', 'media', 'media_url',
            'status', 'created_at', 'accepted_at', 'admin_note',
        ]

    def get_media_url(self, obj):
        if obj.media:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.media.url)
            return obj.media.url
        return None


class ScheduledBotSerializer(serializers.ModelSerializer):
    bot_name = serializers.CharField(source='bot.name', read_only=True)
    operator_name = serializers.SerializerMethodField()
    operator_status = serializers.SerializerMethodField()

    class Meta:
        model = ScheduledBot
        fields = ['id', 'bot', 'bot_name', 'operator_name', 'operator_status']

    def get_operator_name(self, obj):
        if obj.bot.operator:
            return obj.bot.operator.name
        return None

    def get_operator_status(self, obj):
        if obj.bot.operator:
            return obj.bot.operator.status
        return None


class ScheduledCleanupSerializer(serializers.ModelSerializer):
    request = CleanupRequestSerializer(read_only=True)
    scheduled_bots = ScheduledBotSerializer(many=True, read_only=True)

    class Meta:
        model = ScheduledCleanup
        fields = ['schedule_id', 'request', 'scheduled_date', 'scheduled_bots', 'created_at']
