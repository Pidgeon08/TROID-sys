from rest_framework import serializers
from .models import Boat, DetectionEvent, User, Operator, Request, StatusHistory, Photo, DeploymentSchedule, LandfillRecord, RecyclingRecord, SegregationRecord, AuditLog, HeatmapData

class DetectionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetectionEvent
        fields = ['id', 'boat', 'timestamp', 'latitude', 'longitude', 'trash_count']

class BoatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Boat
        fields = ['id', 'name', 'is_active', 'last_latitude', 'last_longitude', 'battery_level', 'last_seen']

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'role', 'status', 'location', 'date_created']

class OperatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Operator
        fields = ['id', 'name', 'status', 'assigned_bot', 'availability']

class StatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StatusHistory
        fields = ['id', 'request', 'label', 'date', 'actor', 'role', 'state']

class PhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = ['id', 'request', 'photo_id', 'label', 'date']

class RequestSerializer(serializers.ModelSerializer):
    status_history = StatusHistorySerializer(many=True, read_only=True)
    photos = PhotoSerializer(many=True, read_only=True)

    class Meta:
        model = Request
        fields = ['id', 'request_id', 'request_type', 'status', 'date_submitted', 'requested_by_name', 'requested_by_role', 'requested_by_barangay', 'contact', 'email', 'location_name', 'barangay', 'municipality', 'province', 'notes', 'letter_file_name', 'letter_size', 'bot_id', 'operator', 'bags', 'weight_kg', 'non_usable_kg', 'recyclable_kg', 'status_history', 'photos']

class DeploymentScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeploymentSchedule
        fields = ['id', 'bot', 'day', 'status', 'label', 'zone']

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


class HeatmapDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeatmapData
        fields = ['id', 'latitude', 'longitude', 'weight', 'source_type', 'timestamp']
