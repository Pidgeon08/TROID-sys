from rest_framework import serializers
from .models import Boat, DetectionEvent, User, Operator, Request, StatusHistory, Photo, DeploymentSchedule, PriorityArea, LandfillRecord, RecyclingRecord, SegregationRecord, AuditLog, HeatmapData, CollectionArea, Notification

class DetectionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetectionEvent
        fields = ['id', 'boat', 'timestamp', 'latitude', 'longitude', 'trash_count', 'categories', 'confidence', 'is_verified']

class BoatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Boat
        fields = ['id', 'name', 'is_active', 'is_online', 'archived', 'last_latitude', 'last_longitude', 'battery_level', 'last_seen']

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'user_id', 'name', 'email', 'role', 'status', 'location', 'date_created', 'must_change_password']


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

class OperatorSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    account_status = serializers.SerializerMethodField()

    def get_email(self, obj):
        return obj.user.email if obj.user else None

    def get_account_status(self, obj):
        return obj.user.status if obj.user else None

    class Meta:
        model = Operator
        fields = ['id', 'operator_id', 'name', 'status', 'assigned_bot', 'availability', 'archived', 'user', 'email', 'account_status']
        extra_kwargs = {
            'operator_id': {'required': False, 'allow_blank': True},
            'user': {'read_only': True},
        }

class StatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StatusHistory
        fields = ['id', 'request', 'label', 'date', 'actor', 'role', 'state', 'details']

class PhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = ['id', 'request', 'photo_id', 'label', 'date', 'image_data']

class RequestSerializer(serializers.ModelSerializer):
    status_history = StatusHistorySerializer(many=True, read_only=True)
    photos = PhotoSerializer(many=True, read_only=True)
    collection_area = serializers.PrimaryKeyRelatedField(
        queryset=CollectionArea.objects.all(), required=False, allow_null=True
    )
    collection_area_detail = serializers.SerializerMethodField()

    def get_collection_area_detail(self, obj):
        if not obj.collection_area:
            return None
        return {
            'id': obj.collection_area.id,
            'area_id': obj.collection_area.area_id,
            'name': obj.collection_area.name,
        }

    class Meta:
        model = Request
        fields = ['id', 'request_id', 'request_type', 'status', 'date_submitted', 'requested_by_name', 'requested_by_role', 'requested_by_barangay', 'contact', 'email', 'location_name', 'barangay', 'municipality', 'province', 'preferred_date', 'preferred_time', 'notes', 'decline_reason', 'parked_from_status', 'letter_file_name', 'letter_size', 'bot_id', 'operator', 'collection_area', 'collection_area_detail', 'bags', 'weight_kg', 'non_usable_kg', 'recyclable_kg', 'session_completed_at', 'trash_categories', 'verified_categories', 'verification_notes', 'verified_at', 'archived', 'status_history', 'photos']
        extra_kwargs = {
            'request_id': {'required': False, 'allow_blank': True},
            'decline_reason': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'requested_by_name': {'required': False, 'allow_blank': True},
            'requested_by_role': {'required': False, 'allow_blank': True},
            'contact': {'required': False, 'allow_blank': True},
            'location_name': {'required': False, 'allow_blank': True},
            'requested_by_barangay': {'required': False, 'allow_blank': True},
            'barangay': {'required': False, 'allow_blank': True},
            'municipality': {'required': False, 'allow_blank': True},
            'province': {'required': False, 'allow_blank': True},
            'preferred_date': {'required': False, 'allow_blank': True},
            'preferred_time': {'required': False, 'allow_blank': True},
        }

class DeploymentScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeploymentSchedule
        fields = ['id', 'bot', 'day', 'status', 'label', 'zone', 'request_id', 'cleanup_type']

class PriorityAreaSerializer(serializers.ModelSerializer):
    bot_name = serializers.SerializerMethodField()

    def get_bot_name(self, obj):
        return obj.bot.name if obj.bot else None

    class Meta:
        model = PriorityArea
        fields = ['id', 'barangay', 'total_bags', 'window_days', 'identified_at', 'deployment_schedule', 'bot', 'bot_name', 'scheduled_day']

class LandfillRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandfillRecord
        fields = ['id', 'record_id', 'barangay', 'date', 'bags', 'weight_kg', 'bot', 'operator', 'vehicle', 'disposed_by']

class RecyclingRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecyclingRecord
        fields = ['id', 'record_id', 'barangay', 'date', 'bags', 'weight_kg', 'category', 'bot', 'operator', 'buyer', 'sold_at']

class SegregationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SegregationRecord
        fields = ['id', 'zone', 'date', 'total_bags', 'total_weight_kg', 'non_usable_weight_kg', 'recyclable_weight_kg', 'notes', 'created_at']

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ['id', 'time', 'user', 'role', 'action', 'details', 'module', 'ip', 'status']
        extra_kwargs = {
            'time': {'required': False, 'allow_blank': True},
            'ip': {'required': False, 'allow_blank': True},
        }


class CollectionAreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CollectionArea
        fields = ['id', 'area_id', 'name', 'barangay', 'submitted_by', 'points', 'closed', 'color', 'status', 'decline_reason', 'reviewed_by', 'date_submitted', 'date_reviewed', 'archived']
        extra_kwargs = {
            'area_id': {'required': False, 'allow_blank': True},
            'decline_reason': {'required': False, 'allow_blank': True},
            'reviewed_by': {'required': False, 'allow_blank': True},
            'barangay': {'required': False, 'allow_blank': True},
            'submitted_by': {'required': False, 'allow_blank': True},
            'color': {'required': False, 'allow_blank': True},
        }


class HeatmapDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeatmapData
        fields = ['id', 'latitude', 'longitude', 'weight', 'source_type', 'timestamp']


class NotificationSerializer(serializers.ModelSerializer):
    request_id = serializers.CharField(source='request.request_id', read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ['id', 'recipient', 'request', 'request_id', 'notif_type', 'title', 'message', 'is_read', 'created_at']
